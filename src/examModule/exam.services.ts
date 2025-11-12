/* eslint-disable prettier/prettier */
import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { BaseService } from 'src/commonServices/BaseServices';
import { Exam } from './exam.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { DatabaseHealthService } from 'src/commonServices/database-health.service';
import { QuestionService } from 'src/QuestionModule/question.service';
import { ExamDataDto } from 'src/DTO/examDataDto';
import { Subject } from 'src/subjectModule/subject.entity';
import { Class } from 'src/classModule/class.entity';
import { Result } from 'src/resultModule/result.entity';
import { Question } from 'src/QuestionModule/question.entity';
@Injectable()
export class ExamServices extends BaseService<Exam> {
  constructor(
    @InjectRepository(Exam)
    repo: Repository<Exam>,

    @Inject(forwardRef(() => QuestionService))
    private readonly questionService: QuestionService,

    protected readonly dbHealth: DatabaseHealthService,

    protected readonly dataSource: DataSource,
  ) {
    super(repo, dbHealth, dataSource);
  }

  /**
   * ✅ Get paginated exams or full list if <= 10
   */
  async getPaginatedExams(page: number = 1, limit: number = 10) {
    const total = await this.repository.count();

    // ✅ Return all exams without pagination when small dataset
    if (total <= limit) {
      const data = await this.repository
        .createQueryBuilder('exam')
        .leftJoinAndSelect('exam.subject', 'subject')
        .leftJoinAndSelect('exam.class', 'class')
        .select(['exam.id', 'subject.Name', 'class.Name', 'exam.timeAllocated', 'exam.status'])
        .getMany();

      return {
        totalItems: total,
        data: data.map((exam) => ({
          id: exam.id,
          subject: exam.subject.Name,
          class: exam.class.Name,
          timeAllocated: exam.timeAllocated,
          status: exam.status,
        })),
        paginated: false,
      };
    }

    // ✅ Paginated flow
    const [data, count] = await this.repository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.subject', 'subject')
      .leftJoinAndSelect('exam.class', 'class')
      .select(['exam.id', 'subject.Name', 'class.Name', 'exam.timeAllocated', 'exam.status'])
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      totalItems: count,
      data: data.map((exam) => ({
        id: exam.id,
        subject: exam.subject.Name,
        class: exam.class.Name,
        timeAllocated: exam.timeAllocated,
        status: exam.status,
      })),
      paginated: true,
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
      await this.questionService.extractQuestionsFromFile(questionFile, savedExam, manager);

      return savedExam;
    });
  }

  /**
   * ✅ Transaction-safe status update
   */
  async updateExamStatus(examId: number, status: boolean) {
    return await this.transactional(async (manager) => {
      const examRepo = manager.getRepository(Exam);
      const exam = await examRepo.findOne({ where: { id: examId } });
      if (!exam) throw new Error(`Exam with ID ${examId} not found.`);
      exam.status = status;
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
    if (!classDetail) throw new Error(`Class '${className}' is not registered.`);

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

    // 3️⃣ Find exams already taken by the student
    const takenExams = await resultRepo.find({ where: { regNo }, relations: ['exam'] });
    const takenIds = takenExams.map((t) => t.exam?.id).filter(Boolean);

    // 4️⃣ Filter exams the student hasn't taken
    const examsToTake = activeExams.filter((exam) => !takenIds.includes(exam.id));

    if (examsToTake.length === 0) {
      throw new Error("You've taken all active exams for your class.");
    }

    // 5️⃣ Format response
    return examsToTake.map((exam) => ({
      id: exam.id,
      subject: exam.subject?.Name ?? 'Unknown',
      type: exam.examType,
      session: exam.session,
      term: exam.term,
      class: exam.class?.Name ?? 'Unknown',
      timeAllocated: exam.timeAllocated,
    }));
  }
}
