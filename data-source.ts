import { DataSource } from 'typeorm';
import { Subject } from './src/subjectModule/subject.entity.js';
import { Class } from './src/classModule/class.entity.js';
import { Question } from './src/QuestionModule/question.entity.js';
import { Exam } from './src/examModule/exam.entity.js';
import { Result } from './src/resultModule/result.entity.js';

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'root',
  password: '',
  database: 'cbt',
  entities: [Subject, Class, Question, Exam, Result],
});
