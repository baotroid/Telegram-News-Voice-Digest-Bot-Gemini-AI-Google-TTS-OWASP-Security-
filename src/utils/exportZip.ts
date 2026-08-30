import JSZip from 'jszip';
import { PythonFile } from '../types';
import { convertImageToBlob } from './imageUtils';

export async function downloadProjectZip(
  files: PythonFile[],
  zipFilename: string = 'telegram-gemini-news-bot.zip',
  avatarSrc?: string
): Promise<void> {
  const zip = new JSZip();

  files.forEach((file) => {
    zip.file(file.path, file.content);
  });

  // If avatar image is provided, embed standard JPEG and PNG files into the ZIP
  if (avatarSrc) {
    try {
      const jpgBlob = await convertImageToBlob(avatarSrc, 'image/jpeg', 0.95);
      const pngBlob = await convertImageToBlob(avatarSrc, 'image/png');
      zip.file('avatar/bot_avatar.jpg', jpgBlob);
      zip.file('avatar/bot_avatar.png', pngBlob);
      zip.file('avatar/README.txt', 'Отправьте bot_avatar.jpg или bot_avatar.png боту @BotFather по команде /setuserpic\n');
    } catch (e) {
      console.warn('Could not embed avatar in ZIP:', e);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = zipFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

