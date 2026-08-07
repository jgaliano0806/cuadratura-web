import { describe, expect, it } from 'vitest';
import {
  classifyCode,
  excelColumn,
  forwardFill,
  inferCycleOffset,
  makeBlocks,
  detectLinkedPairs,
  assignPositions,
  OFFICIAL_LINKED_PAIR,
} from './excel-parser';
import {
  collapseSpaces,
  normalizeCode,
  normalizeDisplayName,
  normalizeKey,
} from './normalization';
import type { ParsedDay, ParsedInspector } from './models';

describe('normalization', () => {
  it('colapsa espacios y normaliza nombres', () => {
    expect(collapseSpaces('  a   b  ')).toBe('a b');
    expect(normalizeDisplayName('Haro  G.')).toBe('Haro G.');
    expect(normalizeKey('Móviles CBA 26-27')).toBe('moviles cba 26 27');
    expect(normalizeKey('Ramos G.')).toBe('ramos g');
    expect(normalizeKey('Haro')).toBe('haro');
    expect(normalizeCode(' m 4 ')).toBe('M4');
  });
});

describe('excel helpers', () => {
  it('convierte índices a columnas Excel', () => {
    expect(excelColumn(0)).toBe('A');
    expect(excelColumn(25)).toBe('Z');
    expect(excelColumn(26)).toBe('AA');
  });

  it('clasifica códigos operativos', () => {
    expect(classifyCode('F')).toEqual(['FRANCO', null, null, false]);
    expect(classifyCode('V')).toEqual(['VACACION', null, null, true]);
    expect(classifyCode('M4')).toEqual(['TRABAJO', 'M', 4, false]);
  });

  it('hace forward-fill solo sobre valores presentes', () => {
    expect(forwardFill(['Mayo', null, '', 'Junio', null])).toEqual([
      'Mayo',
      'Mayo',
      'Mayo',
      'Junio',
      'Junio',
    ]);
  });

  it('infiere offset de ciclo 5x3', () => {
    const origin = new Date('2026-05-01T00:00:00Z');
    const days: ParsedDay[] = [];
    for (let i = 0; i < 16; i++) {
      const date = new Date(origin);
      date.setUTCDate(date.getUTCDate() + i);
      const phase = i % 8;
      const isFranco = phase >= 5;
      days.push({
        date: date.toISOString().slice(0, 10),
        sourceCode: isFranco ? 'F' : 'M1',
        code: isFranco ? 'F' : 'M1',
        dayType: isFranco ? 'FRANCO' : 'TRABAJO',
        shift: isFranco ? null : 'M',
        mobile: isFranco ? null : 1,
        isNovelty: false,
        month: null,
        cell: 'A1',
      });
    }
    expect(inferCycleOffset(days, origin)).toBe(0);
  });

  it('agrupa bloques de trabajo y franco', () => {
    const days: ParsedDay[] = [];
    const start = new Date('2026-05-01T00:00:00Z');
    for (let i = 0; i < 8; i++) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + i);
      const isFranco = i >= 5;
      days.push({
        date: date.toISOString().slice(0, 10),
        sourceCode: isFranco ? 'F' : 'N4',
        code: isFranco ? 'F' : 'N4',
        dayType: isFranco ? 'FRANCO' : 'TRABAJO',
        shift: isFranco ? null : 'N',
        mobile: isFranco ? null : 4,
        isNovelty: false,
        month: null,
        cell: 'B2',
      });
    }
    const blocks = makeBlocks(days);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].blockType).toBe('TRABAJO');
    expect(blocks[0].partial).toBe(false);
    expect(blocks[1].blockType).toBe('FRANCO');
    expect(blocks[1].partial).toBe(false);
  });
});

describe('RN-032 dupla Haro–Ramos G.', () => {
  function makeInspector(
    name: string,
    ordinal: number,
    mobileFn: (i: number) => number | null,
  ): ParsedInspector {
    const origin = new Date('2026-05-01T00:00:00Z');
    const days: ParsedDay[] = [];
    for (let i = 0; i < 50; i++) {
      const date = new Date(origin);
      date.setUTCDate(date.getUTCDate() + i);
      const phase = i % 8;
      const isFranco = phase >= 5;
      const mobile = isFranco ? null : mobileFn(i);
      days.push({
        date: date.toISOString().slice(0, 10),
        sourceCode: isFranco ? 'F' : `N${mobile}`,
        code: isFranco ? 'F' : `N${mobile}`,
        dayType: isFranco ? 'FRANCO' : 'TRABAJO',
        shift: isFranco ? null : 'N',
        mobile,
        isNovelty: false,
        month: null,
        cell: 'A1',
      });
    }
    return {
      ordinal,
      sourceRow: ordinal,
      sourceName: name,
      name,
      nameKey: normalizeKey(name),
      employeeNo: `EXCEL-${ordinal}`,
      days,
      blocks: [],
      cycleOffset: 0,
      positionCode: '',
      positionType: 'GENERAL',
      restGroupCode: '',
      profileCode: 'ROTACION_GENERAL',
      anchorDate: null,
      cycleStartPosition: 0,
      initialShift: null,
      initialMobile: null,
      stateDate: null,
      stateCode: 'F',
      shiftIndex: null,
      mobileIndex: null,
      linkedGroupCode: null,
      linkedRole: null,
    };
  }

  it('asigna solo Haro–Ramos a M4-P03 / M4-P03-EXT', () => {
    const origin = new Date('2026-05-01T00:00:00Z');
    const haro = makeInspector('Haro', 1, (i) =>
      Math.floor(i / 8) % 2 === 0 ? 4 : 1,
    );
    const ramos = makeInspector('Ramos G.', 2, (i) =>
      Math.floor(i / 8) % 2 === 0 ? 1 : 4,
    );
    const other = makeInspector('Del Bel', 3, () => 4);
    const inspectors = [haro, ramos, other];

    const linked = detectLinkedPairs(inspectors);
    expect(linked.pairs).toHaveLength(1);
    expect(linked.issues.some((i) => i.code === 'DUPLA_OFICIAL_CONFIRMADA')).toBe(
      true,
    );
    expect(linked.pairs[0].first).toBe('Haro');
    expect(linked.pairs[0].second).toBe('Ramos G.');

    assignPositions(inspectors, origin, linked.pairs);
    expect(
      inspectors.find((i) => i.name === 'Haro')?.linkedGroupCode,
    ).toBe(OFFICIAL_LINKED_PAIR.groupCode);
    expect(
      inspectors.find((i) => i.name === 'Ramos G.')?.linkedGroupCode,
    ).toBe(OFFICIAL_LINKED_PAIR.groupCode);

    const codes = [haro.positionCode, ramos.positionCode].sort();
    expect(codes).toEqual(['M4-P03', 'M4-P03-EXT']);
    expect(other.positionCode).not.toBe('M4-P03');
    expect(other.positionCode).not.toBe('M4-P03-EXT');
    expect(other.linkedGroupCode).toBeNull();
  });

  it('no inventa otras duplas (CA-032-08)', () => {
    const a = makeInspector('Carranza G.', 1, (i) =>
      Math.floor(i / 8) % 2 === 0 ? 4 : 5,
    );
    const b = makeInspector('Mainardi', 2, (i) =>
      Math.floor(i / 8) % 2 === 0 ? 5 : 4,
    );
    const linked = detectLinkedPairs([a, b]);
    expect(linked.pairs).toHaveLength(0);
    expect(linked.issues.some((i) => i.code === 'DUPLA_OFICIAL_AUSENTE')).toBe(
      true,
    );
  });
});
