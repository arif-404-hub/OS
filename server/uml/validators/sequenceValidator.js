// Sequence Diagram Validator

export function validateSequence(model) {
  const errors = [];
  const actors = model.actors || [];
  const objects = model.sequenceObjects || [];
  const messages = model.messages || [];

  if (!actors.length && !objects.length) {
    errors.push({ rule: 'SEQ_NO_PARTICIPANTS', message: 'Sequence diagram requires lifelines/participants.' });
  }

  if (!messages.length) {
    errors.push({ rule: 'SEQ_NO_MESSAGES', message: 'Sequence diagram requires at least one message exchange.' });
  }

  const allParticipantIds = new Set([
    ...actors.map(a => a.id),
    ...objects.map(o => o.id),
  ]);

  for (const m of messages) {
    if (!allParticipantIds.has(m.from)) {
      errors.push({ rule: 'SEQ_INVALID_SENDER', message: `Sender "${m.from}" is not a registered participant.` });
    }
    if (!allParticipantIds.has(m.to)) {
      errors.push({ rule: 'SEQ_INVALID_RECEIVER', message: `Receiver "${m.to}" is not a registered participant.` });
    }
  }

  return errors;
}
