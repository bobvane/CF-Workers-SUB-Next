/**
 * Parser 公共类型
 */

import { Node } from '@/models/node';

export interface ParserResult {
  success: boolean;
  node?: Node;
  error?: ParserError;
}

export interface ParserError {
  code: string;
  message: string;
}

export function makeError(code: string, message: string): ParserResult {
  return { success: false, error: { code, message } };
}