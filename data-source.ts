import { DataSource } from 'typeorm';
import { Subject } from './src/subjectModule/subject.entity.js';
import { Class } from './src/classModule/class.entity.js';
import { Question } from './src/QuestionModule/question.entity.js';
import { Exam } from './src/examModule/exam.entity.js';
import { Result } from './src/resultModule/result.entity.js';
import * as dotenv from 'dotenv';
dotenv.config();
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.MYSQL_HOST || 'core_mysql',
  port: Number(process.env.MYSQL_PORT) || 3306,
  username: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DB || 'cbt',
  entities: [Subject, Class, Question, Exam, Result],
  // logging: ['query', 'error'],
});
