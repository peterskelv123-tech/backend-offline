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
import { PDFDocument, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import fs from "fs";
import path from 'path';
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
async viewResult(className: string, subject: string,examType:string,session:string,term:string): Promise<ExpectedResultDTO[]> {
const examRef = await this.dataSource
  .getRepository(Exam)
  .createQueryBuilder('exam')
  .innerJoinAndSelect(
    'exam.class',
    'cls',
    'cls.Name = :className',
    { className }
  )
  .innerJoinAndSelect(
    'exam.subject',
    'sub',
    'sub.Name = :subject',
    { subject }
  )
  .where('exam.examType = :examType', { examType })
  .andWhere('exam.term = :term', { term })
  .andWhere('exam.session = :session', { session })
  .getOne();
      //console.log("here is the exam u ask for",examRef)
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
    id: r.id,
    examId: examRef.id,
    regNo: r.regNo,
    score: r.score,
    highestScorePossible: examRef.totalQuestions,
  }));
}
async downloadResultPdf(
  className: string,
  subject: string,
  examType: string,
  session: string,
  term: string,
): Promise<Buffer> {

  const results = await this.viewResult(className, subject, examType, session, term);

  if (!results.length) {
    throw new Error("No results found to generate PDF.");
  }

  const pdfDoc = await PDFDocument.create();

  // ✅ A4 LANDSCAPE
  let page = pdfDoc.addPage([842, 595]);
  const { width, height } = page.getSize();

  const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const boldFont= await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  // ✅ Watermark image (safe absolute path)
  const watermarkPath = path.resolve(
    process.cwd(),
    "uploads",
    "img",
    "school_logo.png",
  );

  const watermarkImageBytes = fs.readFileSync(watermarkPath);
  const watermarkImage = await pdfDoc.embedPng(watermarkImageBytes);

  const drawWatermark = (p) => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    p.drawImage(watermarkImage, {
      x: width / 2 - 150,
      y: height / 2 - 150,
      width: 300,
      height: 300,
      opacity: 0.2,
    });
  };

  drawWatermark(page);

  // ✅ Title (now fits fully)
  const title = `Results for ${className} > ${subject} > ${examType} > ${term} >  ${session}`;
  page.drawText(title, {
    x: 50,
    y: height - 40,
    size: 14,
    font,
  });

  // ✅ QR Code (BOTTOM-RIGHT)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const qrDataUrl = await QRCode.toDataURL(subject);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const qrImageBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
  const qrImage = await pdfDoc.embedPng(qrImageBytes);

  page.drawImage(qrImage, {
    x: width - 100,
    y: 30,
    width: 70,
    height: 70,
  });

  // ✅ Column positions (optimized for A4 landscape)
  const COL_REGNO = 50;
  const COL_SCORE = 420;
  const COL_HIGHEST = 620;

  // ✅ Table headers
  let y = height - 120;
  page.drawText("Full Name", { x: COL_REGNO, y, size: 12, font:boldFont });
  page.drawText("Score", { x: COL_SCORE, y, size: 12, font:boldFont });
  page.drawText("Highest Score", { x: COL_HIGHEST, y, size: 12, font:boldFont });
  y -= 18;

  // ✅ Table rows
  for (const r of results) {
    page.drawText(r.regNo, { x: COL_REGNO, y, size: 11, font });
    page.drawText(String(r.score), { x: COL_SCORE, y, size: 11, font });
    page.drawText(String(r.highestScorePossible), { x: COL_HIGHEST, y, size: 11, font });
    y -= 16;

    // ✅ Pagination (A4 landscape height-aware)
    if (y < 40) {
      page = pdfDoc.addPage([842, 595]);
      drawWatermark(page);
      y = height - 50;
    }
  }

  return Buffer.from(await pdfDoc.save());
}



}