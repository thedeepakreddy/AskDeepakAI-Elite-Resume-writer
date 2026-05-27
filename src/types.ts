/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface TailorRequest {
  baseResumeText: string;
  jobDescriptionText: string;
  companyName: string;
}

export interface TailorResponse {
  success: boolean;
  resumeMarkdown: string;
  coverLetterMarkdown: string;
  projectName: string;
}

export interface ParsedDocument {
  success: boolean;
  text: string;
  fileName: string;
}

export interface PasswordCheckResponse {
  isPasswordRequired: boolean;
  isCorrect: boolean;
}
