/** 받침에 따라 조사를 고른다. 한글로 끝나지 않으면 '이(가)' 꼴로 병기 */
export function josa(word: string, withBatchim: string, without: string): string {
  const code = word.charCodeAt(word.length - 1);
  if (!(code >= 0xac00 && code <= 0xd7a3)) return `${word}${withBatchim}(${without})`;
  return word + ((code - 0xac00) % 28 !== 0 ? withBatchim : without);
}
