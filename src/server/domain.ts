import { Suggestion } from '../../types';

export interface AnalysisResultLike {
  score: number;
  event: string;
  action: string;
  suggestions: Suggestion[];
}
