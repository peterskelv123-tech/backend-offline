import { Class } from 'src/classModule/class.entity';
import { BaseEntity } from 'src/commonEntities.ts/baseORM.entity';
import { ExamType } from 'src/DTO/examTypeDTO';
import { Term } from 'src/DTO/termType';
import { Subject } from 'src/subjectModule/subject.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('exams')
export class Exam extends BaseEntity {
  @Column({ type: 'enum', enum: ExamType })
  examType: ExamType;

  @Column()
  session: string;

  @Column({ type: 'enum', enum: Term })
  term: Term;

  @Column({ type: 'int', default: 60 })
  timeAllocated: number;

  @Column({ type: 'int', default: 0 })
  totalQuestions: number;

  // ✅ subject relation fixed
  @ManyToOne(() => Subject, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'subjectId' })
  subject: Subject;

  @Column({ nullable: true })
  subjectId: number | null;

  // ✅ class relation fixed
  @ManyToOne(() => Class, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'classId' })
  class: Class;

  @Column({ nullable: true })
  classId: number | null;

  @Column({ type: 'boolean', default: false })
  status: boolean;
}
