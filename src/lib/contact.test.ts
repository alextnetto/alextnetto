import { describe, expect, it } from 'vitest';
import { normalizeLinkedin, suggestEmail } from './contact';
import { normalizePhone, phoneProblem } from './phone';

describe('normalizePhone', () => {
  it.each([
    ['(48) 99972-4312', 'BR', '+5548999724312'],
    ['48999724312', 'BR', '+5548999724312'],
    ['048 99972-4312', 'BR', '+5548999724312'],
    ['+55 48 99972-4312', 'BR', '+5548999724312'],
    ['55 48 99972 4312', 'BR', '+5548999724312'],
    ['0055 48 99972 4312', 'BR', '+5548999724312'],
    ['wa.me/5548999724312', 'BR', '+5548999724312'],
    ['https://api.whatsapp.com/send?phone=5548999724312&text=oi', 'BR', '+5548999724312'],
    ['(48) 3333-4444', 'BR', '+554833334444'],
    ['11 91234-5678', 'BR', '+5511912345678'],
    ['４８９９９７２４３１２', 'BR', '+5548999724312'],
    ['+1 (213) 373-4253', 'BR', '+12133734253'],
    ['213-373-4253', 'US', '+12133734253'],
    ['912 345 678', 'PT', '+351912345678'],
    ['+351 912 345 678', 'US', '+351912345678'],
    ['+44 7400 123456', 'BR', '+447400123456'],
  ])('reads %s (%s) as %s', (raw, country, expected) => {
    expect(normalizePhone(raw, country)).toBe(expected);
  });

  it.each([
    ['', 'BR'],
    ['abc', 'BR'],
    ['48 9997-4312', 'BR'],
    ['+55 48 99972-43121', 'BR'],
    ['48 99972-4312 ramal 2', 'BR'],
    ['9999', 'BR'],
  ])('rejects %s (%s)', (raw, country) => {
    expect(normalizePhone(raw, country)).toBeNull();
  });

  it('falls back to Brazil for an unknown country code', () => {
    expect(normalizePhone('48999724312', 'XX')).toBe('+5548999724312');
  });
});

describe('phoneProblem', () => {
  it('explains the missing ninth digit of a Brazilian mobile number', () => {
    expect(phoneProblem('48 9997-4312', 'BR', 'pt')).toMatch(/9 dígitos/);
  });

  it('flags a number that is too short or too long', () => {
    expect(phoneProblem('4899', 'BR', 'pt')).toMatch(/incompleto/i);
    expect(phoneProblem('+55 48 99972-43121', 'BR', 'en')).toMatch(/too long/i);
  });

  it('asks for digits only', () => {
    expect(phoneProblem('48 99972-4312 ramal 2', 'BR', 'pt')).toMatch(/dígitos/);
  });

  it('says nothing about a valid number', () => {
    expect(phoneProblem('(48) 99972-4312', 'BR', 'pt')).toBeUndefined();
  });
});

describe('normalizeLinkedin', () => {
  it.each([
    ['https://www.linkedin.com/in/maria-souza-123/', 'https://www.linkedin.com/in/maria-souza-123'],
    ['linkedin.com/in/maria-souza', 'https://www.linkedin.com/in/maria-souza'],
    ['www.linkedin.com/in/maria-souza', 'https://www.linkedin.com/in/maria-souza'],
    ['br.linkedin.com/in/maria-souza', 'https://www.linkedin.com/in/maria-souza'],
    ['http://linkedin.com/in/Maria-Souza', 'https://www.linkedin.com/in/maria-souza'],
    [
      'https://www.linkedin.com/in/maria-souza?utm_source=share&utm_campaign=share_via&utm_content=profile&utm_medium=ios_app',
      'https://www.linkedin.com/in/maria-souza',
    ],
    ['https://www.linkedin.com/in/maria-souza/details/experience/', 'https://www.linkedin.com/in/maria-souza'],
    ['https://www.linkedin.com/mwlite/in/maria-souza', 'https://www.linkedin.com/in/maria-souza'],
    ['https://linkedin.com/in/jo%C3%A3o-silva', 'https://www.linkedin.com/in/jo%C3%A3o-silva'],
    ['linkedin.com/in/joão-silva', 'https://www.linkedin.com/in/jo%C3%A3o-silva'],
    ['in/maria-souza', 'https://www.linkedin.com/in/maria-souza'],
    ['@maria-souza', 'https://www.linkedin.com/in/maria-souza'],
    ['maria-souza', 'https://www.linkedin.com/in/maria-souza'],
    ['https://www.linkedin.com/company/fator-ai/', 'https://www.linkedin.com/company/fator-ai'],
    ['https://lnkd.in/dK3xYz7', 'https://lnkd.in/dK3xYz7'],
  ])('reads %s', (raw, expected) => {
    expect(normalizeLinkedin(raw)).toBe(expected);
  });

  it.each([
    '',
    'Maria Souza',
    'facebook.com/maria',
    'linkedin.com',
    'https://www.linkedin.com/feed/',
    'linkedin.com/in/',
    'https://evil.example/linkedin.com/in/maria',
    'https://linkedin.com.evil.example/in/maria',
    'javascript:alert(1)',
  ])('rejects %s', (raw) => {
    expect(normalizeLinkedin(raw)).toBeNull();
  });
});

describe('suggestEmail', () => {
  it.each([
    ['maria@gmial.com', 'maria@gmail.com'],
    ['maria@gmail.con', 'maria@gmail.com'],
    ['maria@hotmail.com.b', 'maria@hotmail.com.br'],
    ['maria@hotmial.com', 'maria@hotmail.com'],
    ['maria@outlok.com', 'maria@outlook.com'],
    ['maria@yahoo.com.bt', 'maria@yahoo.com.br'],
  ])('suggests a fix for %s', (typed, fixed) => {
    expect(suggestEmail(typed)).toBe(fixed);
  });

  it('leaves a correct or unknown domain alone', () => {
    expect(suggestEmail('maria@gmail.com')).toBeUndefined();
    expect(suggestEmail('maria@distribuidorasul.com.br')).toBeUndefined();
  });
});
