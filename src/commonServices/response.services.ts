import { HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class ResponseService {
  success<T>(
    data: T,
    message = 'Request successful',
    statusCode = HttpStatus.OK,
  ) {
    return {
      success: true,
      statusCode,
      message,
      data,
    };
  }

  error(message = 'An error occurred', statusCode = HttpStatus.BAD_REQUEST) {
    return {
      success: false,
      statusCode,
      message,
    };
  }
}
