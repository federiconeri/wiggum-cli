/**
 * Unit tests for input manipulation utilities
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePastedText,
  insertTextAtCursor,
  deleteCharBefore,
  deleteCharAfter,
  deleteWordBefore,
  moveCursorByWordLeft,
  moveCursorByWordRight,
} from './input-utils.js';

describe('normalizePastedText', () => {
  describe('single-line text', () => {
    it('returns unchanged single-line text', () => {
      expect(normalizePastedText('hello world')).toBe('hello world');
    });

    it('collapses multiple spaces to single space', () => {
      expect(normalizePastedText('foo  bar  baz')).toBe('foo bar baz');
    });

    it('handles empty string', () => {
      expect(normalizePastedText('')).toBe('');
    });
  });

  describe('multi-line paste flattening', () => {
    it('converts \\n to spaces', () => {
      expect(normalizePastedText('line one\nline two\nline three')).toBe(
        'line one line two line three'
      );
    });

    it('converts \\r\\n to spaces', () => {
      expect(normalizePastedText('line1\r\nline2\r\nline3')).toBe('line1 line2 line3');
    });

    it('converts \\r to spaces', () => {
      expect(normalizePastedText('a\rb\rc')).toBe('a b c');
    });

    it('handles mixed line endings', () => {
      expect(normalizePastedText('line1\r\nline2\nline3\rline4')).toBe(
        'line1 line2 line3 line4'
      );
    });

    it('handles multiple consecutive newlines', () => {
      expect(normalizePastedText('foo\n\n\nbar')).toBe('foo bar');
    });
  });

  describe('bracket paste mode markers', () => {
    it('strips \\u001b[200~ (start marker)', () => {
      expect(normalizePastedText('\u001b[200~hello')).toBe('hello');
    });

    it('strips \\u001b[201~ (end marker)', () => {
      expect(normalizePastedText('world\u001b[201~')).toBe('world');
    });

    it('strips both markers', () => {
      expect(normalizePastedText('\u001b[200~content\u001b[201~')).toBe('content');
    });

    it('strips markers with multi-line content', () => {
      expect(normalizePastedText('\u001b[200~line1\nline2\u001b[201~')).toBe(
        'line1 line2'
      );
    });
  });

  describe('tab handling', () => {
    it('converts tabs to spaces', () => {
      expect(normalizePastedText('hello\tworld')).toBe('hello world');
    });

    it('converts multiple tabs', () => {
      expect(normalizePastedText('a\tb\tc')).toBe('a b c');
    });

    it('handles tabs with newlines (collapses to single space)', () => {
      expect(normalizePastedText('line1\t\nline2')).toBe('line1 line2');
    });
  });

  describe('escape sequence handling', () => {
    it('strips escape characters', () => {
      expect(normalizePastedText('hello\u001bworld')).toBe('helloworld');
    });

    it('strips multiple escape sequences', () => {
      expect(normalizePastedText('\u001ba\u001bb\u001bc')).toBe('abc');
    });
  });

  describe('complex scenarios', () => {
    it('handles paste with all special characters', () => {
      const input = '\u001b[200~line1\r\nline2\n\tline3\u001b[201~';
      expect(normalizePastedText(input)).toBe('line1 line2 line3');
    });

    it('handles large multi-line paste', () => {
      const lines = Array(100).fill('test line').join('\n');
      const result = normalizePastedText(lines);
      expect(result).toBe(Array(100).fill('test line').join(' '));
    });
  });

  describe('whitespace collapsing', () => {
    it('collapses multiple consecutive spaces', () => {
      expect(normalizePastedText('hello    world')).toBe('hello world');
    });

    it('collapses mixed whitespace (spaces, tabs, newlines)', () => {
      expect(normalizePastedText('foo \t\n bar')).toBe('foo bar');
    });

    it('collapses leading whitespace', () => {
      expect(normalizePastedText('   hello')).toBe(' hello');
    });

    it('collapses trailing whitespace', () => {
      expect(normalizePastedText('world   ')).toBe('world ');
    });

    it('preserves single spaces between words', () => {
      expect(normalizePastedText('one two three')).toBe('one two three');
    });

    it('handles text with only whitespace', () => {
      expect(normalizePastedText('  \t\n  ')).toBe(' ');
    });
  });
});

describe('insertTextAtCursor', () => {
  describe('basic insertion', () => {
    it('inserts at beginning', () => {
      const result = insertTextAtCursor('world', 0, 'hello ');
      expect(result).toEqual({
        newValue: 'hello world',
        newCursorIndex: 6,
      });
    });

    it('inserts at end', () => {
      const result = insertTextAtCursor('hello', 5, ' world');
      expect(result).toEqual({
        newValue: 'hello world',
        newCursorIndex: 11,
      });
    });

    it('inserts in middle', () => {
      const result = insertTextAtCursor('foobar', 3, 'baz');
      expect(result).toEqual({
        newValue: 'foobazbar',
        newCursorIndex: 6,
      });
    });

    it('inserts into empty string', () => {
      const result = insertTextAtCursor('', 0, 'hello');
      expect(result).toEqual({
        newValue: 'hello',
        newCursorIndex: 5,
      });
    });
  });

  describe('edge cases', () => {
    it('inserts empty string', () => {
      const result = insertTextAtCursor('test', 2, '');
      expect(result).toEqual({
        newValue: 'test',
        newCursorIndex: 2,
      });
    });

    it('handles single character insertion', () => {
      const result = insertTextAtCursor('hllo', 1, 'e');
      expect(result).toEqual({
        newValue: 'hello',
        newCursorIndex: 2,
      });
    });
  });
});

describe('deleteCharBefore', () => {
  describe('basic deletion', () => {
    it('deletes character before cursor', () => {
      const result = deleteCharBefore('hello', 5);
      expect(result).toEqual({
        newValue: 'hell',
        newCursorIndex: 4,
      });
    });

    it('deletes character in middle', () => {
      const result = deleteCharBefore('abcdef', 3);
      expect(result).toEqual({
        newValue: 'abdef',
        newCursorIndex: 2,
      });
    });

    it('deletes first character', () => {
      const result = deleteCharBefore('test', 1);
      expect(result).toEqual({
        newValue: 'est',
        newCursorIndex: 0,
      });
    });
  });

  describe('edge cases', () => {
    it('does nothing at start of line (cursor at 0)', () => {
      const result = deleteCharBefore('hello', 0);
      expect(result).toEqual({
        newValue: 'hello',
        newCursorIndex: 0,
      });
    });

    it('handles empty string', () => {
      const result = deleteCharBefore('', 0);
      expect(result).toEqual({
        newValue: '',
        newCursorIndex: 0,
      });
    });

    it('handles single character string', () => {
      const result = deleteCharBefore('a', 1);
      expect(result).toEqual({
        newValue: '',
        newCursorIndex: 0,
      });
    });

    it('handles negative cursor index', () => {
      const result = deleteCharBefore('test', -1);
      expect(result).toEqual({
        newValue: 'test',
        newCursorIndex: 0,
      });
    });
  });
});

describe('deleteCharAfter', () => {
  describe('basic deletion', () => {
    it('deletes character after cursor', () => {
      const result = deleteCharAfter('hello', 0);
      expect(result).toEqual({
        newValue: 'ello',
        newCursorIndex: 0,
      });
    });

    it('deletes character in middle', () => {
      const result = deleteCharAfter('abcdef', 2);
      expect(result).toEqual({
        newValue: 'abdef',
        newCursorIndex: 2,
      });
    });

    it('deletes last character', () => {
      const result = deleteCharAfter('test', 3);
      expect(result).toEqual({
        newValue: 'tes',
        newCursorIndex: 3,
      });
    });
  });

  describe('edge cases', () => {
    it('does nothing at end of line', () => {
      const result = deleteCharAfter('hello', 5);
      expect(result).toEqual({
        newValue: 'hello',
        newCursorIndex: 5,
      });
    });

    it('handles empty string', () => {
      const result = deleteCharAfter('', 0);
      expect(result).toEqual({
        newValue: '',
        newCursorIndex: 0,
      });
    });

    it('handles single character string', () => {
      const result = deleteCharAfter('a', 0);
      expect(result).toEqual({
        newValue: '',
        newCursorIndex: 0,
      });
    });

    it('handles cursor beyond string length', () => {
      const result = deleteCharAfter('test', 10);
      expect(result).toEqual({
        newValue: 'test',
        newCursorIndex: 10,
      });
    });
  });
});

describe('deleteWordBefore', () => {
  it('deletes word before cursor at end of string', () => {
    const result = deleteWordBefore('hello world', 11);
    expect(result).toEqual({
      newValue: 'hello ',
      newCursorIndex: 6,
    });
  });

  it('deletes word before cursor in middle', () => {
    // Cursor at index 7 (space after "bar"): deletes "bar" but keeps surrounding spaces
    const result = deleteWordBefore('foo bar baz', 7);
    expect(result).toEqual({
      newValue: 'foo  baz',
      newCursorIndex: 4,
    });
  });

  it('does nothing at start of line', () => {
    const result = deleteWordBefore('hello', 0);
    expect(result).toEqual({
      newValue: 'hello',
      newCursorIndex: 0,
    });
  });

  it('handles empty string', () => {
    const result = deleteWordBefore('', 0);
    expect(result).toEqual({
      newValue: '',
      newCursorIndex: 0,
    });
  });

  it('deletes single word', () => {
    const result = deleteWordBefore('hello', 5);
    expect(result).toEqual({
      newValue: '',
      newCursorIndex: 0,
    });
  });

  it('skips trailing whitespace then deletes word', () => {
    const result = deleteWordBefore('hello   ', 8);
    expect(result).toEqual({
      newValue: '',
      newCursorIndex: 0,
    });
  });
});

describe('moveCursorByWordLeft', () => {
  describe('basic word navigation', () => {
    it('moves to start of current word', () => {
      expect(moveCursorByWordLeft('hello world', 11)).toBe(6);
    });

    it('skips whitespace before word', () => {
      expect(moveCursorByWordLeft('foo  bar', 8)).toBe(5);
    });

    it('handles cursor in middle of word', () => {
      expect(moveCursorByWordLeft('testing', 4)).toBe(0);
    });

    it('handles multiple words', () => {
      expect(moveCursorByWordLeft('one two three', 13)).toBe(8);
    });
  });

  describe('edge cases', () => {
    it('does nothing at start', () => {
      expect(moveCursorByWordLeft('test', 0)).toBe(0);
    });

    it('handles empty string', () => {
      expect(moveCursorByWordLeft('', 0)).toBe(0);
    });

    it('handles single word', () => {
      expect(moveCursorByWordLeft('word', 4)).toBe(0);
    });

    it('handles only whitespace', () => {
      expect(moveCursorByWordLeft('   ', 3)).toBe(0);
    });

    it('handles cursor at start of word', () => {
      expect(moveCursorByWordLeft('hello world', 6)).toBe(0);
    });
  });

  describe('special characters', () => {
    it('treats underscore as word character', () => {
      expect(moveCursorByWordLeft('foo_bar', 7)).toBe(0);
    });

    it('treats numbers as word characters', () => {
      expect(moveCursorByWordLeft('test123', 7)).toBe(0);
    });

    it('stops at punctuation', () => {
      expect(moveCursorByWordLeft('hello, world', 12)).toBe(7);
    });
  });
});

describe('moveCursorByWordRight', () => {
  describe('basic word navigation', () => {
    it('moves to end of next word', () => {
      expect(moveCursorByWordRight('hello world', 0)).toBe(5);
    });

    it('skips whitespace before word', () => {
      expect(moveCursorByWordRight('foo  bar', 3)).toBe(8);
    });

    it('handles cursor in middle of word', () => {
      expect(moveCursorByWordRight('testing', 2)).toBe(7);
    });

    it('handles multiple words', () => {
      expect(moveCursorByWordRight('one two three', 0)).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('does nothing at end', () => {
      expect(moveCursorByWordRight('test', 4)).toBe(4);
    });

    it('handles empty string', () => {
      expect(moveCursorByWordRight('', 0)).toBe(0);
    });

    it('handles single word', () => {
      expect(moveCursorByWordRight('word', 0)).toBe(4);
    });

    it('handles only whitespace', () => {
      expect(moveCursorByWordRight('   ', 0)).toBe(3);
    });

    it('handles cursor at end of word', () => {
      expect(moveCursorByWordRight('hello world', 5)).toBe(11);
    });
  });

  describe('special characters', () => {
    it('treats underscore as word character', () => {
      expect(moveCursorByWordRight('foo_bar', 0)).toBe(7);
    });

    it('treats numbers as word characters', () => {
      expect(moveCursorByWordRight('test123', 0)).toBe(7);
    });

    it('stops at punctuation', () => {
      expect(moveCursorByWordRight('hello, world', 0)).toBe(5);
    });
  });
});
