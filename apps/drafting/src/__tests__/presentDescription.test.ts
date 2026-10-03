import { presentDescription } from '../utils/presentDescription';

describe('presentDescription', () => {
  it('strips the prefix and capitalises the remainder', () => {
    expect(
      presentDescription(
        'Document-rules config for affidavit_identity — standalone affidavit of identity for KYC, bank, property, government use',
      ),
    ).toBe('Standalone affidavit of identity for KYC, bank, property, government use');
  });

  it('leaves a description with no prefix unchanged', () => {
    expect(presentDescription('Standard bail application')).toBe('Standard bail application');
  });

  it('strips the prefix when the id segment has a parenthetical and the remainder has its own dash', () => {
    expect(
      presentDescription(
        'Document-rules config for joint_development_agreement (JDA) — Landowner contributes land. Stamp duty varies by state — some treat as conveyance.',
      ),
    ).toBe('Landowner contributes land. Stamp duty varies by state — some treat as conveyance.');
  });
});
