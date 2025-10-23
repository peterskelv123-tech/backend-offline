/* eslint-disable prettier/prettier */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, QueryRunner } from 'typeorm';
import * as fs from 'fs';
import mammoth from 'mammoth';
import { Question } from './question.entity';
import { BaseService } from 'src/commonServices/BaseServices';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';
import { Exam } from '../examModule/exam.entity'; // ✅ adjust path as needed
import { ExamServices } from 'src/examModule/exam.services';

@Injectable()
export class QuestionService extends BaseService<Question> {
  constructor(
    @InjectRepository(Question)
    repo: Repository<Question>,
    @Inject(forwardRef(() => ExamServices))
    private readonly examService: ExamServices,
    protected readonly dbhealth: DatabaseHealthService,
  ) {
    super(repo, dbhealth);
  }

  /**
   * Extracts questions from a file, validates against exam, and inserts transactionally.
   * Rolls back all inserts if validation or saving fails.
   */
async extractQuestionsFromFile(
  filePath: string,
  exam: Exam,
  managerOrRunner?: EntityManager | QueryRunner,
) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  let text = '';

  // ✅ Extract text
  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    text = result.value
      // 🧹 Normalize line breaks for consistency
      .replace(/\r/g, '')
      .replace(/\n+/g, '\n')
      // ✅ Force newlines before question numbers and options
      .replace(/(\d+)\./g, '\n$1.')
      .replace(/([A-E])\)/g, '\n$1)')
      // ✅ Normalize "Answer" labels
      .replace(/Answer\s*([A-Za-z])/gi, '\nAnswer: $1')
      // ✅ Remove document titles or headings like “Progressive Test”
      .replace(/^.*Progressive\s*Test.*$/gim, '')
      .trim();
  } else if (ext === 'pdf') {
    const pdfParseModule = await import('pdf-parse');
    const pdfCandidate =
      (pdfParseModule as unknown as { default?: unknown }).default ?? pdfParseModule;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const pdfParseFunc: (data: Buffer) => Promise<{ text?: string }> =
      typeof pdfCandidate === 'function'
        ? (pdfCandidate as any)
        : () => ({ text: '' });

    const buffer = fs.readFileSync(filePath);
    const result = await pdfParseFunc(buffer);
    text = result.text ?? '';
  } else {
    throw new Error('Unsupported file format. Only .docx or .pdf allowed.');
  }

  // 🧾 Log what we actually extracted (for debugging)
  console.log('🧾 RAW EXTRACTED TEXT START -------------------');
  console.log(text.slice(0, 800)); // limit log to 800 chars
  console.log('🧾 RAW EXTRACTED TEXT END ---------------------');

  // ✅ Parse questions
  const questions = this.parseQuestions(text);
  console.log('✅ Parsed Questions:', JSON.stringify(questions, null, 2));

  // ✅ Handle question count
  const totalQuestionsInFile = questions.length;
  const maxAllowed = Number(exam.totalQuestions) || totalQuestionsInFile;

  const selectedQuestions =
    totalQuestionsInFile > maxAllowed
      ? questions.slice(0, maxAllowed)
      : questions;

  // ✅ Handle transactions
  const connection = this.repository.manager.connection;
  const isExternalTransaction = !!managerOrRunner;
  let queryRunner: QueryRunner | null = null;

  try {
    if (!isExternalTransaction) {
      queryRunner = connection.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    const manager = isExternalTransaction
      ? 'manager' in (managerOrRunner as any)
        ? (managerOrRunner as QueryRunner).manager
        : (managerOrRunner as EntityManager)
      : queryRunner!.manager;

    // ✅ Save questions
    await manager.save(
      Question,
      selectedQuestions.map((q) => ({
        ...q,
        examId: exam.id,
      })),
    );

    if (!isExternalTransaction) {
      await queryRunner!.commitTransaction();
      await queryRunner!.release();
    }

    return selectedQuestions.length;
  } catch (error) {
    if (queryRunner) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
    console.error('❌ Question extraction failed:', error);
    throw error;
  }
}
  /**
   * Parses text content into structured questions.
   */
private parseQuestions(
  text: string,
): { question: string; options: string[]; correctAnswer: string }[] {
  // Step 1: Normalize spacing and enforce line breaks for consistency
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\n+/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .replace(/([A-E])\)/g, '\n$1)')
    .replace(/Answer\s*([A-Za-z])/gi, '\nAnswer: $1')
    .trim();

  console.log("🧾 Normalized Text:\n", normalized);

  // Step 2: Split each question block based on "Answer:" marker
  const questionBlocks = normalized
    .split(/Answer:\s*[A-Za-z]/gi)
    .filter((b) => b.trim().length > 0);

  const answerLetters = [...normalized.matchAll(/Answer:\s*([A-Za-z])/gi)].map(
    (m) => m[1].toUpperCase()
  );

  const questions: {
    question: string;
    options: string[];
    correctAnswer: string;
  }[] = [];

  // Step 3: Loop through each question block
  questionBlocks.forEach((block, index) => {
    // Extract the correct answer letter
    const answerLetter = answerLetters[index];

    // Find the main question line (before the first A))
    const questionMatch = block.match(/^(.*?)\s*[A-E]\)/s);
    const question = questionMatch
      ? questionMatch[1].replace(/\n/g, ' ').trim()
      : block.split(/[A-E]\)/i)[0]?.trim() || '';

    // Extract all options (A), B), C)...)
    const options =
      block
        .match(/[A-E]\)\s*([^\n]+)/gi)
        ?.map((opt) => opt.replace(/[A-E]\)\s*/, '').trim())
        .filter((opt) => opt.length > 0) || [];

    // Resolve correct answer
    let correctAnswer = '';
    if (answerLetter && options.length > 0) {
      const idx = answerLetter.charCodeAt(0) - 65; // A=0, B=1, etc.
      if (idx >= 0 && idx < options.length) {
        correctAnswer = options[idx];
      }
    }

    // Push if valid
    if (question && options.length) {
      questions.push({
        question,
        options,
        correctAnswer,
      });
    }
  });

  //console.log('✅ Parsed Questions:', JSON.stringify(questions, null, 2));

  return questions;
}

  async examTakerQuestions(examId: number) {
    const exam = await this.examService.findOne(examId);
    if (!exam) throw new Error(`Exam with ID ${examId} not found.`);

    const totalToPick = exam.totalQuestions ?? 0;
    if (totalToPick <= 0) throw new Error('Invalid totalQuestions value.');

    const questions = await this.repository
      .createQueryBuilder('q')
      .where('q.examId = :examId', { examId })
      .orderBy('RAND()') // PostgreSQL / SQLite
      // .orderBy('RAND()') // MySQL
      .limit(totalToPick)
      .getMany();

    return questions.map((q) => ({
      id: q.id,
      question: q.question,
      options: q.options,
    }));
  }
}
