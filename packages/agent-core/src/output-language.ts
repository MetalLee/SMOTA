export const SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION =
  "输出语言：在中文环境下，所有面向用户的标题、正文、报告、任务描述和说明必须使用简体中文；技术标识、文件名、命令、代码、API 名称和专有模型名可以保留英文。";

export function withSimplifiedChineseOutputInstruction(text: string): string {
  return `${text}\n${SIMPLIFIED_CHINESE_OUTPUT_INSTRUCTION}`;
}
