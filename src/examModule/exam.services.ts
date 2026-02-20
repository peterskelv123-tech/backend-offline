/* eslint-disable prettier/prettier */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/commonServices/BaseServices';
import { Exam } from './exam.entity';
import { InjectRepository } from '@nestjs/typeorm';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DataSource, Not, Repository } from 'typeorm';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';
import { QuestionService } from 'src/QuestionModule/question.service';
import { ExamDataDto } from 'src/DTO/examDataDto';
import { Subject } from 'src/subjectModule/subject.entity';
import { Class } from 'src/classModule/class.entity';
import { Result } from 'src/resultModule/result.entity';
import { Question } from 'src/QuestionModule/question.entity';
import { createHash } from 'crypto';
import { RedisService } from 'src/commonServices/Redis.service';
@Injectable()
export class ExamServices extends BaseService<Exam> {
  constructor(
    @InjectRepository(Exam)
    repo: Repository<Exam>,

    @Inject(forwardRef(() => QuestionService))
    private readonly questionService: QuestionService,

    protected readonly dbHealth: DatabaseHealthService,

    protected readonly dataSource: DataSource,

    protected readonly redisService: RedisService,
  ) {
    super(repo, dbHealth, dataSource);
  }

  private async generateUniqueExamRoomID(examId: number): Promise<string> {
  const examDetails = await this.repository.findOne({
    where: { id: examId },
    relations: ['class', 'subject'],
  });

  if (!examDetails) {
    throw new Error(`Exam with ID ${examId} not found.`);
  }

  const className = examDetails.class?.Name ?? 'UnknownClass';
  const subjectName = examDetails.subject?.Name ?? 'UnknownSubject';

  const timestamp = Date.now();

  // cryptographic part (5 chars)
  const cryptoPart = createHash('sha256')
    .update(`${examId}:${timestamp}:${process.env.ROOM_ID_SECRET}`)
    .digest('base64url')
    .slice(0, 5);

  return `${className}_${subjectName}_${examId}_${cryptoPart}`;
}
  /**
   * ✅ Get paginated exams or full list if <= 10
   */
  async findInvigilatorExamDetail(examID: number) {

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const data = await this.repository
    .createQueryBuilder('exam')
    .leftJoin('exam.subject', 'subject')
    .leftJoin('exam.class', 'class')
    .select([
      'subject.name AS subject',
      'class.name AS className',
      'exam.session AS session',
    ])
    .where('exam.id = :examID', { examID })
    .getRawOne();

  if (!data) return null;

  return {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    subject: data.subject,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    className: data.className,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    session: data.session,
  };
}
async getAllSessions() {
  return this.getDistinctField('session');
}

async getAllTerms() {
  return this.getDistinctField('term');
}

async getAllExamTypes() {
  return this.getDistinctField('examType');
}

async getPaginatedExams(
  page: number = 1,
  limit: number = 10,
  filter: string = "",
  session: string = "",
  term: string = "",
  examType: string = ""
) {
  const total = await this.repository.count();

  const query = this.repository
    .createQueryBuilder('exam')
    .leftJoinAndSelect('exam.subject', 'subject')
    .leftJoinAndSelect('exam.class', 'examClass')
    .select([
      'exam.id',
      'subject.Name',
      'examClass.Name',
      'exam.timeAllocated',
      'exam.status',
    ]);

  /* 🔍 Generic search filter */
  if (filter?.trim()) {
    query.where(
      `(
        LOWER(subject.Name) LIKE LOWER(:filter)
        OR LOWER(examClass.Name) LIKE LOWER(:filter)
      )`,
      { filter: `%${filter}%` }
    );
  }

  /* 🎯 Optional exact filters */
  if (session?.trim()) {
    query.andWhere('exam.session = :session', { session });
  }

  if (term?.trim()) {
    query.andWhere('exam.term = :term', { term });
  }

  if (examType?.trim()) {
    query.andWhere('exam.examType = :examType', { examType });
  }

  let data: any[];
  let count: number;

  if (total <= limit) {
    data = await query.getMany();
    count = data.length;
  } else {
    [data, count] = await query
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  const mappedData = await Promise.all(
    data.map(async (exam) => ({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      id: exam.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      subject: exam.subject.Name,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      class: exam.class.Name,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      timeAllocated: exam.timeAllocated,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      status: exam.status,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
      roomId: (await this.redisService.getRoomByExam(exam.id)) ?? null,
    }))
  );

  return {
    currentPage: page,
    totalPages: total > limit ? Math.ceil(count / limit) : 1,
    totalItems: count,
    data: mappedData,
    paginated: total > limit,
  };
}
  /**
   * ✅ Transactional delete: exams + questions + results
   */
async deleteAnExamEntry(examID: number) {
  return await this.transactional(async (manager) => {
    await manager.delete(Question, { examId: examID });
    await manager.delete(Result, { exam: { id: examID } });
    await manager.delete(Exam, { id: examID });
    return { success: true };
  });
}



  /**
   * ✅ Create exam + parse questions using transactional safety
   */
  async addToExam(examDetails: ExamDataDto, questionFile: string) {
    return await this.transactional(async (manager) => {
      const subjectRepo = manager.getRepository(Subject);
      const classRepo = manager.getRepository(Class);
      const examRepo = manager.getRepository(Exam);

      // ✅ Find or create subject
      let subject = await subjectRepo.findOne({ where: { Name: examDetails.subject } });
      if (!subject) {
        subject = await subjectRepo.save(subjectRepo.create({ Name: examDetails.subject }));
      }

      // ✅ Find or create class
      let classEntity = await classRepo.findOne({ where: { Name: examDetails.className } });
      if (!classEntity) {
        classEntity = await classRepo.save(classRepo.create({ Name: examDetails.className }));
      }

      // ✅ Create new exam
      
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const exam = examRepo.create({
        examType: examDetails.examType,
        session: examDetails.session,
        term: examDetails.term,
        timeAllocated: examDetails.timeAllocated,
        subject,
        class: classEntity,
        status: false,
        totalQuestions: examDetails.totalQuestions ?? 0,
      });

      const savedExam = await examRepo.save(exam);

      // ✅ Parse + Save questions (transaction-aware)
      await this.questionService.extractQuestionsFromFile(questionFile,savedExam, manager);
      return savedExam;
    });
  }

  /**
   * ✅ Transaction-safe status update
   */
  async examCleanup(): Promise<void> {
  await this.repository.update(
    { status: true },
    { status: false },
  );

  await this.redisService.clearAllRedis();
}

  async updateExamStatus(examId: number, newStatus: boolean) {
  return await this.transactional(async (manager) => {
    const examRepo = manager.getRepository(Exam);

    const exam = await examRepo.findOne({ where: { id: examId } });
    if (!exam) {
      throw new Error(`Exam with ID ${examId} not found.`);
    }

    // No-op protection
    if (exam.status === newStatus) {
      return exam;
    }

    // 🔼 INACTIVE → ACTIVE
    if (newStatus === true) {
      if (!exam.classId) {
        throw new Error('Cannot activate exam without a class.');
      }

      // Deactivate other active exams in same class
//       const activeExams = await examRepo.find({
//         where: {
//           classId: exam.classId,
//           status: true,
//           id: Not(examId),
//         },
//       });

//       if (activeExams.length > 0) {
//   await examRepo.update(
//     { classId: exam.classId, status: true, id: Not(examId) },
//     { status: false }
//   );

//   await Promise.all(
//     activeExams.map((activeExam) =>
//       this.redisService.removeRoomByExam(activeExam.id)
//     )
//   );
// }


      // Create room for this exam
      const roomId = await this.generateUniqueExamRoomID(examId);
      await this.redisService.createRoomForExam(examId, roomId, 24 * 60 * 60);
    }

    // 🔽 ACTIVE → INACTIVE
    if (newStatus === false) {
      await this.redisService.removeRoomByExam(examId);
    }

    exam.status = newStatus;
    return await examRepo.save(exam);
  });
}
  /**
   * ✅ Get active exams not taken by student
   */
 async TakeAnExam(className: string, regNo: string) {
  const classRepo = this.dataSource.getRepository(Class);
  const examRepo = this.dataSource.getRepository(Exam);
  const resultRepo = this.dataSource.getRepository(Result);

  // 1️⃣ Class lookup
  const classDetail = await classRepo.findOne({ where: { Name: className } });
  if (!classDetail) {
    throw new Error(`Class '${className}' is not registered.`);
  }

  // 2️⃣ Fetch active exams
  const activeExams = await examRepo
    .createQueryBuilder('exam')
    .leftJoinAndSelect('exam.class', 'class')
    .leftJoinAndSelect('exam.subject', 'subject')
    .where('exam.classId = :id', { id: classDetail.id })
    .andWhere('exam.status = true')
    .getMany();

  if (activeExams.length === 0) {
    throw new Error(`No active exams found for class ${className}.`);
  }

  // 3️⃣ Exams already taken
  const takenExams = await resultRepo.find({
    where: { regNo },
    relations: ['exam'],
  });

  const takenIds = takenExams
    .map((t) => t.exam?.id)
    .filter(Boolean);

  // 4️⃣ Filter remaining exams
  const examsToTake = activeExams.filter(
    (exam) => !takenIds.includes(exam.id),
  );

  if (examsToTake.length === 0) {
    throw new Error("You've taken all active exams for your class.");
  }

  // 5️⃣ Format response (STRICT time contract)
  return Promise.all(
    examsToTake.map(async (exam) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const studentRecord =
        await this.redisService.getStudentAttendanceSnapshot(
          regNo,
          exam.id,
        );

      // 🔒 HARD GUARD — never silently reset time
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (studentRecord && typeof studentRecord.timeLeft !== 'number') {
        throw new Error(
          `Invalid attendance state: timeLeft missing for exam ${exam.id}`,
        );
      }

      return {
        id: exam.id,
        subject: exam.subject?.Name ?? 'Unknown',
        type: exam.examType,
        session: exam.session,
        term: exam.term,
        class: exam.class?.Name ?? 'Unknown',

        // always config, never mutated
        durationSeconds: exam.timeAllocated * 60,

        // runtime state ONLY if started
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        remainingSeconds: studentRecord
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          ? studentRecord.timeLeft
          : null,
        hasStarted: Boolean(studentRecord),
      };
    }),
  );
}

}
