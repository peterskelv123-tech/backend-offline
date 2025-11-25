/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource } from 'typeorm';
import * as fs from 'fs';
import mammoth from 'mammoth';
import { Question } from './question.entity';
import { BaseService } from 'src/commonServices/BaseServices';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';
import { Exam } from '../examModule/exam.entity'; // ✅ adjust path as needed
import { ExamServices } from 'src/examModule/exam.services';
import { RedisService } from 'src/commonServices/Redis.service';

@Injectable()
export class QuestionService extends BaseService<Question> {
  constructor(
    @InjectRepository(Question)
    repo: Repository<Question>,

    @Inject(forwardRef(() => ExamServices))
    private readonly examService: ExamServices,
    protected readonly redis:RedisService,
    protected readonly dbHealth: DatabaseHealthService,
    protected readonly dataSource: DataSource,
  ) {
    super(repo, dbHealth, dataSource);
  }

  /**
   * Extract questions from file and insert them.
   * ✅ Works with OR without a transaction (optional manager)
   */
  async extractQuestionsFromFile(
    filePath: string,
    exam: Exam,
    manager?: EntityManager, // ✅ our upgraded pattern
  ): Promise<number> {

    // ✅ Use transactional repo if provided
    const repo = this.getRepo(manager);

    // --- STEP 1: Extract text depending on file extension ---
    const ext = filePath.split('.').pop()?.toLowerCase();
    let text = '';

    if (ext === 'docx') {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value
        .replace(/\r/g, '')
        .replace(/\n+/g, '\n')
        .replace(/(\d+)\./g, '\n$1.')
        .replace(/([A-E])\)/g, '\n$1)')
        .replace(/Answer\s*([A-Za-z])/gi, '\nAnswer: $1')
        .replace(/^.*Progressive\s*Test.*$/gim, '')
        .trim();
    } else if (ext === 'pdf') {
      const pdfModule = await import('pdf-parse');
      const pdfParse =
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        (pdfModule as any).default ?? (pdfModule as any);

      const buffer = fs.readFileSync(filePath);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      const result = await pdfParse(buffer);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      text = result.text ?? '';
    } else {
      throw new Error('Unsupported file format. Only .docx or .pdf allowed.');
    }

    // --- STEP 2: Parse questions ---
    const questions = this.parseQuestions(text);

    if (questions.length === 0) {
      throw new Error('No valid questions found in the file.');
    }

    // Handle limit
    const maxQuestions = Number(exam.totalQuestions) || questions.length;
    if(maxQuestions>questions.length){
      throw new Error(" question bank has to contain more or equal questions to what students are to answer")
    }
    
    // --- STEP 3: Save questions (transaction optional) ---
    await repo.save(
      questions.map((q) => ({
        ...q,
        examId: exam.id,
      })),
    );

    return questions.length;
  }

  /**
   * Parses extracted text.
   */
  private parseQuestions(
    text: string
  ): { question: string; options: string[]; correctAnswer: string }[] {
    const normalized = text
      .replace(/\r/g, '')
      .replace(/\n+/g, '\n')
      .replace(/\s{2,}/g, ' ')
      .replace(/([A-E])\)/g, '\n$1)')
      .replace(/Answer\s*([A-Za-z])/gi, '\nAnswer: $1')
      .trim();

    const questionBlocks = normalized
      .split(/Answer:\s*[A-Za-z]/gi)
      .filter((b) => b.trim().length > 0);

    const answerLetters = [
      ...normalized.matchAll(/Answer:\s*([A-Za-z])/gi),
    ].map((m) => m[1].toUpperCase());

    const questions: { question: string; options: string[]; correctAnswer: string }[] = [];

    questionBlocks.forEach((block, index) => {
      const answerLetter = answerLetters[index];

      const questionMatch = block.match(/^(.*?)\s*[A-E]\)/s);
      let question = questionMatch
        ? questionMatch[1].replace(/\n/g, ' ').trim()
        : block.split(/[A-E]\)/)[0]?.trim() ?? '';

      // remove leading numbers "1. "
      question = question.replace(/^\d+\.\s*/, '');

      const options =
        block
          .match(/[A-E]\)\s*([^\n]+)/gi)
          ?.map((opt) => opt.replace(/[A-E]\)\s*/, '').trim())
          ?? [];

      let correctAnswer = '';
      if (answerLetter && options.length > 0) {
        const idx = answerLetter.charCodeAt(0) - 65;
        if (idx >= 0 && idx < options.length) {
          correctAnswer = options[idx];
        }
      }

      if (question && options.length) {
        questions.push({ question, options, correctAnswer });
      }
    });

    return questions;
  }

  /**
   * Get questions for exam taker (randomized).
   */
async examTakerQuestions(examId: number, studentId: string) {
  // 1️⃣ Fetch the exam metadata
  const exam = await this.examService.findOne(examId);
  if (!exam) throw new Error(`Exam with ID ${examId} not found.`);

  // 2️⃣ Fetch progress for this specific exam
  const record = await this.redis.getProgress(studentId, examId);

  // 3️⃣ Identify already answered questions
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  const alreadyTaken = new Set<number>(
    (record?.questionMeta?.map((q: { id: number }) => q.id) ?? []),
  );
  const answeredCount = alreadyTaken.size;
  const remainingToPick = exam.totalQuestions - answeredCount;

  // 4️⃣ If student completed all questions, return only previously answered
  if (remainingToPick <= 0) {
    return record?.questionMeta ?? [];
  }

  // 5️⃣ Fetch all questions for this exam
  const allQuestions = await this.repository.find({
    where: { examId },
    select: ['id', 'question', 'options'],
  });

  // 6️⃣ Filter only new questions that haven't been answered
  const newQuestions = allQuestions.filter((q) => !alreadyTaken.has(q.id));

  if (newQuestions.length < remainingToPick) {
    throw new Error(
      `Not enough remaining questions. Needed ${remainingToPick}, found ${newQuestions.length}`
    );
  }

  // 7️⃣ Shuffle only the new questions
  const shuffledNew = newQuestions
    .map((q) => ({ sort: Math.random(), q }))
    .sort((a, b) => a.sort - b.sort)
    .slice(0, remainingToPick)
    .map((i) => i.q);

  // 8️⃣ Combine previously answered with newly selected questions
  return [...(record?.questionMeta ?? []), ...shuffledNew];
}
}
