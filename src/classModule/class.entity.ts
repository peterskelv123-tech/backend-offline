import { Subject } from 'src/subjectModule/subject.entity';
import { Entity } from 'typeorm';

@Entity('classes')
export class Class extends Subject {}
