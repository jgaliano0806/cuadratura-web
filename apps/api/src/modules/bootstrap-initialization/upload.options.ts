import { memoryStorage } from 'multer';

export const excelUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    const ok =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel');
    cb(ok ? null : new Error('Solo se admiten archivos .xlsx'), ok);
  },
};
