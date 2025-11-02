import { BaseEntity } from 'src/commonEntities.ts/baseORM.entity';
import { Exam } from 'src/examModule/exam.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

@Entity()
export class Result extends BaseEntity {
  // Define your entity columns and relations here
  @ManyToOne(() => Exam, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'examId' })
  exam: Exam;
  @Column()
  regNo: string;
  @Column()
  score: number;
}
