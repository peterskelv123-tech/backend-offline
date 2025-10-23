import { BaseEntity } from 'src/commonEntities.ts/baseORM.entity';
import { Exam } from 'src/examModule/exam.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity('attendances')
export class Attendance extends BaseEntity {
  // Define columns and relations as needed
  @Column({ unique: true })
  regNo: string;
  @ManyToOne(() => Exam, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'examId' })
  exam: Exam;
  @Column()
  examId: number;
  @Column({ type: 'boolean', default: false })
  attended: boolean;
}
