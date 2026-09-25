import { describe, it, expect } from 'vitest';
import { buildChitchatMessages } from '../groq-client.js';

// chitchat() itself (-> callGroq() -> network) is NOT exercised here, same
// rationale as groq-client.js's other network-touching functions.

describe('groq-client.buildChitchatMessages', () => {
  it('returns a system + user message pair', () => {
    const messages = buildChitchatMessages('haha vui ghê', 'vi');
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
    expect(messages[1].content).toBe('haha vui ghê');
  });

  it('instructs the model to reply in Vietnamese when language is vi', () => {
    const messages = buildChitchatMessages('x', 'vi');
    expect(messages[0].content).toMatch(/Reply warmly in Vietnamese/);
  });

  it('instructs the model to reply in English when language is en', () => {
    const messages = buildChitchatMessages('x', 'en');
    expect(messages[0].content).toMatch(/Reply warmly in English/);
  });

  it('does not ask for JSON/markdown output', () => {
    const messages = buildChitchatMessages('x', 'en');
    expect(messages[0].content).toMatch(/no markdown, no JSON/);
  });

  it('tells the model not to claim knowledge of a specific CR unless the message contains one', () => {
    const messages = buildChitchatMessages('x', 'en');
    expect(messages[0].content).toMatch(/Never claim to know about a specific CR/);
  });

  it('mentions this is Capybara embedded in the Automation Hub dashboard', () => {
    const messages = buildChitchatMessages('x', 'en');
    expect(messages[0].content).toMatch(/Capybara/);
    expect(messages[0].content).toMatch(/SimpleMDG Automation Hub/);
  });
});
