/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable prettier/prettier */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager, DataSource } from 'typeorm';
import mammoth from 'mammoth';
import { Question } from './question.entity';
import { BaseService } from 'src/commonServices/BaseServices';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';
import JSZip from 'jszip';
import fs from 'fs';
import { DOMParser } from 'xmldom';
//import { Exam } from '../examModule/exam.entity'; // ✅ adjust path as needed
import { ExamServices } from 'src/examModule/exam.services';
import { RedisService } from 'src/commonServices/Redis.service';
import { Exam } from 'src/examModule/exam.entity';

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
  manager?: EntityManager,
) {

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const repo = this.getRepo(manager);

  const ext = filePath.split('.').pop()?.toLowerCase();
  if (ext !== 'docx') {
    throw new Error('Only DOCX files are supported.');
  }

  // ⚠️ Temporary: plain-text extraction only
  const result = await mammoth.extractRawText({ path: filePath });

  const text = result.value
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/(\d+)\./g, '\n$1.')
    .replace(/([A-E])\)/g, '\n$1)')
    // eslint-disable-next-line no-useless-escape
    .replace(/Answer\s*[:\-]?\s*([A-E])/gi, '\nAnswer: $1')
    .replace(/^.*Progressive\s*Test.*$/gim, '')
    .trim();

  const questions = this.parseQuestions(text);
 //console.log(questions);
  if (questions.length === 0) {
    throw new Error('No valid questions found in the file.');
  }

  const maxQuestions = Number(exam.totalQuestions) || questions.length;
  if (maxQuestions > questions.length) {
    throw new Error(
      'Question bank must contain at least the total exam questions.',
    );
  }

  await repo.save(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    questions.map(q => ({
      ...q,
      examId: exam.id,
    })),
  );
 //console.log(questions.length)
  return questions.length;
}

  /**
   * Parses extracted text.
   */
private parseQuestions(text: string) {
  const questions:{question:string,options:any[],correctAnswer:any}[] = [];

  // 1️⃣ Normalize
  const normalized = text
    .replace(/\r/g, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // 2️⃣ Split by ANSWER (this is the key)
  const chunks = normalized.split(
    /(?:Answer|Correct Answer|Ans)\s*[:\-]?\s*[A-E]/gi
  );

  // 3️⃣ Extract answer letters separately
  const answers = [...normalized.matchAll(
    /(Answer|Correct Answer|Ans)\s*[:\-]?\s*([A-E])/gi
  )].map(m => m[2].toUpperCase());

  chunks.forEach((chunk, index) => {
    const clean = chunk
      .replace(/^\d+\.\s*/, '')
      .trim();

    if (!clean) return;

    const optionMatches = [...clean.matchAll(
      /([A-E])[.)]\s*(.+?)(?=[A-E][.)]|$)/gs
    )];

    if (optionMatches.length < 2) return;

    const options = optionMatches.map(o => o[2].trim());

    const question = clean.slice(
      0,
      optionMatches[0].index
    ).trim();

    if (!question) return;

    let correctAnswer = '';
    const letter = answers[index];
    if (letter) {
      const idx = letter.charCodeAt(0) - 65;
      if (options[idx]) correctAnswer = options[idx];
    }

    questions.push({
      question,
      options,
      correctAnswer,
    });
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
async extractDocxWithFormulas(filePath: string) {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const xml = await zip.file('word/document.xml')?.async('text');
  if (!xml) throw new Error('Invalid DOCX');

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const doc = new DOMParser().parseFromString(xml, 'text/xml');

  let formulaIndex = 0;
  const formulas: Record<string, string> = {};

  // Find all math nodes
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const mathNodes = doc.getElementsByTagName('m:oMathPara');

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  for (let i = 0; i < mathNodes.length; i++) {
    const placeholder = `{{FORMULA_${++formulaIndex}}}`;

    // TEMP: store raw XML for now
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    formulas[placeholder] = mathNodes[i].toString();

    // Replace math node with placeholder text
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const textNode = doc.createTextNode(placeholder);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    mathNodes[i].parentNode?.replaceChild(textNode, mathNodes[i]);
  }

  // Extract remaining text content
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const text = doc.documentElement.textContent ?? '';

  return { text, formulas };
}
}
