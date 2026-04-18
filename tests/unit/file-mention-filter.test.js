const path = require('path');

// Reproduce the file-mention extraction logic from index.js
const SENDABLE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.mp4', '.mp3', '.ogg', '.wav', '.aac', '.csv', '.xlsx', '.docx', '.pptx', '.zip', '.txt', '.html', '.json', '.svg']);

function extractMentionedFiles(responseText) {
  const mentionedFiles = new Set();
  const extPattern = [...SENDABLE_EXTS].map(e => e.replace('.', '').replace('+', '\\+')).join('|');
  const fileRefRegex = new RegExp(`[\\w./@-]+\\.(${extPattern})\\b`, 'gi');
  for (const m of responseText.matchAll(fileRefRegex)) {
    mentionedFiles.add(path.basename(m[0]).toLowerCase());
  }
  return mentionedFiles;
}

function shouldSendFile(basename, mentionedFiles) {
  const filterByMentions = mentionedFiles.size > 0;
  if (filterByMentions && !mentionedFiles.has(basename.toLowerCase())) return false;
  return true;
}

describe('file mention filter', () => {
  test('extracts simple filename from response', () => {
    const mentioned = extractMentionedFiles('Here is your video: output.mp4');
    expect(mentioned.has('output.mp4')).toBe(true);
  });

  test('extracts filename with path prefix', () => {
    const mentioned = extractMentionedFiles('I saved it to /workspace/videos/final.mp4');
    expect(mentioned.has('final.mp4')).toBe(true);
  });

  test('extracts multiple filenames', () => {
    const mentioned = extractMentionedFiles('Created thumbnail.jpg and video.mp4 for you.');
    expect(mentioned.has('thumbnail.jpg')).toBe(true);
    expect(mentioned.has('video.mp4')).toBe(true);
  });

  test('returns empty set when no files mentioned', () => {
    const mentioned = extractMentionedFiles('I completed the task successfully.');
    expect(mentioned.size).toBe(0);
  });

  test('matching is case-insensitive', () => {
    const mentioned = extractMentionedFiles('Created Output.MP4');
    expect(mentioned.has('output.mp4')).toBe(true);
  });

  test('filters out intermediate files not mentioned in response', () => {
    const mentioned = extractMentionedFiles('Here is your video: final_video.mp4');
    expect(shouldSendFile('final_video.mp4', mentioned)).toBe(true);
    expect(shouldSendFile('frame_001.png', mentioned)).toBe(false);
    expect(shouldSendFile('frame_002.png', mentioned)).toBe(false);
    expect(shouldSendFile('temp_audio.wav', mentioned)).toBe(false);
    expect(shouldSendFile('background.jpg', mentioned)).toBe(false);
  });

  test('sends all files when response mentions no files (fallback)', () => {
    const mentioned = extractMentionedFiles('Done! The video is ready.');
    expect(mentioned.size).toBe(0);
    // When no files are mentioned, all files should be sent (filterByMentions = false)
    expect(shouldSendFile('output.mp4', mentioned)).toBe(true);
    expect(shouldSendFile('frame_001.png', mentioned)).toBe(true);
    expect(shouldSendFile('audio.wav', mentioned)).toBe(true);
  });

  test('handles filenames with dots in directory path', () => {
    const mentioned = extractMentionedFiles('Saved to my.project/output.mp4');
    expect(mentioned.has('output.mp4')).toBe(true);
  });

  test('handles filenames with hyphens and underscores', () => {
    const mentioned = extractMentionedFiles('Created my-cool_video.mp4');
    expect(mentioned.has('my-cool_video.mp4')).toBe(true);
  });

  test('does not match non-sendable extensions', () => {
    const mentioned = extractMentionedFiles('Saved data to output.py and script.sh');
    expect(mentioned.size).toBe(0);
  });

  test('video creation scenario — only final video sent', () => {
    const response = `I've created the video for you! The final output is saved as presentation.mp4.

Here's what I did:
1. Downloaded the images
2. Added background music
3. Combined everything into the final video`;

    const mentioned = extractMentionedFiles(response);
    expect(mentioned.has('presentation.mp4')).toBe(true);
    expect(mentioned.size).toBe(1);

    // Only the mentioned video should be sent
    expect(shouldSendFile('presentation.mp4', mentioned)).toBe(true);
    // Intermediate files should be blocked
    expect(shouldSendFile('image1.jpg', mentioned)).toBe(false);
    expect(shouldSendFile('image2.png', mentioned)).toBe(false);
    expect(shouldSendFile('background_music.mp3', mentioned)).toBe(false);
    expect(shouldSendFile('narration.wav', mentioned)).toBe(false);
  });

  test('image generation scenario — only final image sent', () => {
    const response = 'Here is your generated image: result.png';
    const mentioned = extractMentionedFiles(response);

    expect(shouldSendFile('result.png', mentioned)).toBe(true);
    expect(shouldSendFile('draft_1.png', mentioned)).toBe(false);
    expect(shouldSendFile('reference.jpg', mentioned)).toBe(false);
  });
});
