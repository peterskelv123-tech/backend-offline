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
@Injectable()
export class ExamServices extends BaseService<Exam> {
  constructor(
    @InjectRepository(Exam)
    repo: Repository<Exam>,
    @Inject(forwardRef(() => QuestionService))
    private readonly questionService: QuestionService,
    protected readonly dbHealth: DatabaseHealthService,
    private readonly dataSource: DataSource,
  ) {
    super(repo, dbHealth);
  }
  async getPaginatedExams(page: number = 1, limit: number = 10) {
    const total = await this.repository.count();

  // ✅ If items ≤ 10, just return all exams without pagination
  if (total <= limit) {
      const data = await this.repository
        .createQueryBuilder('exam')
        .leftJoinAndSelect('exam.subject', 'subject')
        .leftJoinAndSelect('exam.class', 'class')
        .select([
          'exam.id',
          'subject.name',
          'class.name',
          'exam.timeAllocated',
          'exam.status',
        ])
        .getMany();

      const formatted = data.map((exam) => ({
        id: exam.id,
        subject: exam.subject.Name,
        class: exam.class.Name,
        timeAllocated: exam.timeAllocated,
        status: exam.status,
    }));

    return {
        totalItems: total,
        data: formatted,
        paginated: false, // just to make it explicit
      };
    }

  // ✅ Else, use pagination
    const [data, count] = await this.repository
      .createQueryBuilder('exam')
      .leftJoinAndSelect('exam.subject', 'subject')
      .leftJoinAndSelect('exam.class', 'class')
      .select([
        'exam.id',
        'subject.name',
        'class.name',
        'exam.timeAllocated',
        'exam.status',
      ])
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    const formatted = data.map((exam) => ({
      id: exam.id,
      subject: exam.subject.Name,
      class: exam.class.Name,
      timeAllocated: exam.timeAllocated,
      status: exam.status,
  }));
  return {
      currentPage: page,
    totalPages: Math.ceil(count / limit),
    totalItems: count,
    data: formatted,
    paginated: true,
  };
}
async addToExam(examDetails: ExamDataDto, questionFile: string) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // ✅ Find or create subject
    let subject = await queryRunner.manager.findOne(Subject, {
      where: { Name: examDetails.subject },
    });
    if (!subject) {
      subject = queryRunner.manager.create(Subject, { Name: examDetails.subject });
      subject = await queryRunner.manager.save(subject);
    }

    // ✅ Find or create class
    let classEntity = await queryRunner.manager.findOne(Class, {
      where: { Name: examDetails.className },
    });
    if (!classEntity) {
      classEntity = queryRunner.manager.create(Class, { Name: examDetails.className });
      classEntity = await queryRunner.manager.save(classEntity);
    }

    // ✅ Create exam
    const exam = queryRunner.manager.create(Exam, {
      examType: examDetails.examType,
      session: examDetails.session,
      term: examDetails.term,
      timeAllocated: examDetails.timeAllocated,
      subject: subject,
      class: classEntity,
      status: false,
    });

    const savedExam = await queryRunner.manager.save(exam);

    // ✅ Parse and insert questions
    await this.questionService.extractQuestionsFromFile(
      questionFile,
      savedExam,
      queryRunner.manager,
    );

    // ✅ Commit
    await queryRunner.commitTransaction();
    return savedExam;
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw new Error(
      `An error occurred during exam creation: ${(error as Error).message}`,
    );
  } finally {
    await queryRunner.release();
  }
}
async TakeAnExam(className: string) {
  const classRepo = this.dataSource.getRepository(Class);
  const examRepo = this.dataSource.getRepository(Exam);

  const userClassDetail = await classRepo.findOne({
    where: { Name: className },
  });

  if (!userClassDetail) {
    throw new Error(`Class with name ${className} has not yet been registered.`);
  }
  const examDetails = await examRepo
  .createQueryBuilder('exam')
  .leftJoinAndSelect('exam.class', 'class')
  .leftJoinAndSelect('exam.subject', 'subject')
  .where('exam.classId = :classId', { classId: userClassDetail.id })
  .andWhere('exam.status = :status', { status: true })
  .getMany();


  if (examDetails.length === 0) {
    throw new Error(`No exam found for class ${className}.`);
  }

  return examDetails.map((exam) => ({
    id: exam.id,
    subject: exam.subject?.Name ?? 'Unknown',
    class: exam.class?.Name ?? 'Unknown',
    timeAllocated: exam.timeAllocated,
  }));
}

}
