// T-436 (c): downloadBlob and filenameFromDisposition live in lib/download and are re-exported,
// as the same functions, from components/editor/exportUtils (AnnexuresCard and the editor import
// them from there).
import * as exportUtils from '@/components/editor/exportUtils';

import { downloadBlob, filenameFromDisposition } from '../download';

describe('lib/download', () => {
  it('exportUtils re-exports the very same functions', () => {
    expect(exportUtils.downloadBlob).toBe(downloadBlob);
    expect(exportUtils.filenameFromDisposition).toBe(filenameFromDisposition);
  });

  it('downloadBlob clicks an anchor with the filename and revokes the object URL', () => {
    const create = jest.fn(() => 'blob:x');
    const revoke = jest.fn();
    Object.defineProperty(window.URL, 'createObjectURL', { value: create, configurable: true });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: revoke, configurable: true });
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('LAW-2026-27-0001.pdf');
      expect(this.href).toBe('blob:x');
    });
    const blob = new Blob(['x']);
    downloadBlob(blob, 'LAW-2026-27-0001.pdf');
    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:x');
    click.mockRestore();
  });

  it('filenameFromDisposition: quoted, bare, path stripped, fallback', () => {
    expect(filenameFromDisposition('attachment; filename="LAW-2026-27-0001.pdf"', 'f.pdf')).toBe(
      'LAW-2026-27-0001.pdf',
    );
    expect(filenameFromDisposition('attachment; filename=a.pdf', 'f.pdf')).toBe('a.pdf');
    expect(filenameFromDisposition('attachment; filename="../../etc/x.pdf"', 'f.pdf')).toBe(
      'x.pdf',
    );
    expect(filenameFromDisposition(null, 'f.pdf')).toBe('f.pdf');
    expect(filenameFromDisposition('attachment', 'f.pdf')).toBe('f.pdf');
  });
});
