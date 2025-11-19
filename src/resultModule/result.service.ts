/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { BaseService } from 'src/commonServices/BaseServices';
import { Result } from './result.entity';
import { AnswerDTO } from 'src/DTO/answerDTO';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';
import { Question } from 'src/QuestionModule/question.entity';
import { Exam } from 'src/examModule/exam.entity';
import { ExpectedResultDTO } from 'src/DTO/createdExamDto';

@Injectable()
export class ResultService extends BaseService<Result> {
  constructor(
    @InjectRepository(Result)
    repo: Repository<Result>,
    protected readonly dbHealth: DatabaseHealthService,

    protected readonly dataSource: DataSource,
  ) {
    super(repo, dbHealth, dataSource);
  }

  /**
   * Adds a student's result for an exam.
   * Supports both normal mode AND running inside a transaction.
   */
  async markNdAddToResult(
    answers: AnswerDTO[],
    examId: number,
    regNo: string,
    manager?: EntityManager,   // ✅ transactional support
  ): Promise<Result> {

    const repo = this.getRepo(manager);  // ✅ use transactional repo if provided

    // ✅ Step 1 — Check if result already exists
    const existingResult = await repo.findOne({
      where: {
        exam: { id: examId },
        regNo,
      },
      relations: ["exam"],
    });

    if (existingResult) {
      throw new Error("Result already exists for this exam and student.");
    }

    // ✅ Step 2 — Fetch exam questions using correct repository
    const questionRepo = manager
      ? manager.getRepository(Question)
      : this.dataSource.getRepository(Question);

    const examQuestions = await questionRepo.find({
      where: { examId },
    });

    if (!examQuestions.length) {
      throw new Error("No questions found for this exam.");
    }

    // ✅ Step 3 — Build a map of correct answers
    const correctMap = new Map(
      examQuestions.map((q) => [q.id, q.correctAnswer])
    );

    // ✅ Step 4 — Compute the score
    const score = answers.filter(
      (a) => correctMap.get(a.questionId) === a.answerText
    ).length;

    // ✅ Step 5 — Load exam entity (using transactional manager if present)
    const examRepo = manager
      ? manager.getRepository(Exam)
      : this.dataSource.getRepository(Exam);

    const exam = await examRepo.findOne({ where: { id: examId } });

    if (!exam) {
      throw new Error("Exam not found.");
    }

    // ✅ Step 6 — Create the result entry
    const result = repo.create({
      exam,
      regNo,
      score,
    });

    // ✅ Step 7 — Save (transaction-safe)
    return await repo.save(result);
  }
async viewResult(className: string, subject: string,examType:string): Promise<ExpectedResultDTO[]> {
  // 1️⃣ Get exam for this class + subject
    const examRef = await this.dataSource
      .getRepository(Exam)
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.class', 'class')
      .leftJoinAndSelect('exam.subject', 'subject')
      .where('class.name = :className', { className })
      .andWhere('subject.name = :subject', { subject })
      .andWhere('exam.examType = :examType', { examType }) 
      .getOne();

  if (!examRef) {
    throw new Error(`No exam found for class ${className} and subject ${subject}`);
  }
  // 2️⃣ Get all results for this exam sorted by highest score
  const results = await this.repository.find({
    where: {
      exam: { id: examRef.id },
    },
    order: {
      score: "DESC",
    },
    relations: {
      exam: true,
    },
  });

  // 3️⃣ Map to ExpectedResultDTO
  return results.map((r) => ({
    examId: examRef.id,
    regNo: r.regNo,
    score: r.score,
    highestScorePossible: examRef.totalQuestions,
  }));
}
}