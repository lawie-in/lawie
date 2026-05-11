import './setupDb';

import mongoose from 'mongoose';

import { LawieDocument } from '../models/Document.model';

describe('Document model', () => {
  const validDoc = {
    userId: new mongoose.Types.ObjectId(),
    title: 'Bail Application — District Court, Saket',
    docType: 'bail_application',
    courtType: 'district_court',
    courtName: 'District & Sessions Court, Saket, New Delhi',
    generatedContent: 'encrypted_content_base64_string',
    status: 'draft' as const,
  };

  it('creates a document with required fields', async () => {
    const doc = await LawieDocument.create(validDoc);
    expect(doc.title).toBe(validDoc.title);
    expect(doc.docType).toBe('bail_application');
    expect(doc.status).toBe('draft');
    expect(doc.isDeleted).toBe(false);
    expect(doc.version).toBe(1);
    expect(doc.sectionsCited).toEqual([]);
    expect(doc.exportedAs).toEqual([]);
  });

  it('rejects missing title', async () => {
    await expect(LawieDocument.create({ ...validDoc, title: undefined })).rejects.toThrow(
      /title is required/,
    );
  });

  it('rejects missing docType', async () => {
    await expect(LawieDocument.create({ ...validDoc, docType: undefined })).rejects.toThrow(
      /docType is required/,
    );
  });

  it('rejects invalid docType', async () => {
    await expect(LawieDocument.create({ ...validDoc, docType: 'invalid_type' })).rejects.toThrow(
      /is not a valid enum/,
    );
  });

  it('rejects missing generatedContent', async () => {
    await expect(
      LawieDocument.create({ ...validDoc, generatedContent: undefined }),
    ).rejects.toThrow(/generatedContent is required/);
  });

  it('stores soft delete flag', async () => {
    const doc = await LawieDocument.create(validDoc);
    expect(doc.isDeleted).toBe(false);

    doc.isDeleted = true;
    await doc.save();

    const found = await LawieDocument.findById(doc._id);
    expect(found!.isDeleted).toBe(true);
  });

  it('stores formInputs as flexible object', async () => {
    const doc = await LawieDocument.create({
      ...validDoc,
      formInputs: {
        petitioner: 'Ram Kumar',
        respondent: 'State of Delhi',
        fir_number: '123/2026',
      },
    });
    expect((doc.formInputs as Record<string, unknown>).petitioner).toBe('Ram Kumar');
  });

  it('stores sectionsCited', async () => {
    const doc = await LawieDocument.create({
      ...validDoc,
      sectionsCited: ['BNS 103', 'BNSS 482'],
    });
    expect(doc.sectionsCited).toEqual(['BNS 103', 'BNSS 482']);
  });

  it('stores templateId reference', async () => {
    const templateId = new mongoose.Types.ObjectId();
    const doc = await LawieDocument.create({
      ...validDoc,
      templateId,
    });
    expect(doc.templateId!.toString()).toBe(templateId.toString());
  });

  it('increments version manually', async () => {
    const doc = await LawieDocument.create(validDoc);
    expect(doc.version).toBe(1);

    doc.version = 2;
    doc.finalContent = 'user_edited_encrypted_content';
    await doc.save();

    const found = await LawieDocument.findById(doc._id);
    expect(found!.version).toBe(2);
    expect(found!.finalContent).toBe('user_edited_encrypted_content');
  });

  it('stores status transitions', async () => {
    const doc = await LawieDocument.create(validDoc);
    doc.status = 'finalised';
    await doc.save();
    expect(doc.status).toBe('finalised');

    doc.status = 'exported';
    doc.exportedAs = ['pdf', 'docx'];
    await doc.save();
    expect(doc.status).toBe('exported');
    expect(doc.exportedAs).toEqual(['pdf', 'docx']);
  });
});
