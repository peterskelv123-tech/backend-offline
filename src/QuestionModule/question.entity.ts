import { BaseEntity } from 'src/commonEntities.ts/baseORM.entity';
import { Exam } from 'src/examModule/exam.entity';
import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
@Entity('questions')
export class Question extends BaseEntity {
  @Column({ type: 'text' })
  question: string;

  // Store options in a JSON array for flexibility
  @Column({ type: 'simple-json', nullable: true })
  options: string[] | null; // e.g. ["Option A", "Option B", "Option C"]

  @Column({
    type: 'text',
    nullable: true,
    transformer: {
      to: (value: any) =>
        typeof value === 'string' ? value : JSON.stringify(value),
      from: (value: string | null) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return value ? JSON.parse(value) : null;
        } catch {
          return value;
        }
      },
    },
  })
  correctAnswer: string | null;

  @ManyToOne(() => Exam, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'examId' })
  exam: Exam;

  @Column({ nullable: true })
  examId: number | null;
}
