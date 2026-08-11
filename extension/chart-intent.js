/** Chart-read intent — mirrored in lib/chart-read-intent.ts for server tests. */
function offeredChartRead(assistant) {
  const a = assistant.toLowerCase();
  return (
    /\b(want me to|should i|can i|pull|grab|get you|give you|take a|do a)\b/.test(a) &&
    /\b(read|chart|look|verdict|screenshot|see)\b/.test(a)
  );
}

function wantsChartRead(text, context) {
  const t = text.trim().toLowerCase();
  if (!t) return false;

  if (
    /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|please|please do|do it|absolutely|for sure)[.!]?$/i.test(
      t
    )
  ) {
    if (context?.lastAssistant && offeredChartRead(context.lastAssistant)) return true;
  }

  if (/\b(get|give|need|want)\s+(me\s+)?(a\s+)?(verdict|chart read|read|update|look)\b/.test(t)) {
    return true;
  }
  if (/\b(look at|check|read|scan)\s+(the\s+)?(chart|this|it)\b/.test(t)) return true;
  if (/\bwhat do you see\b/.test(t)) return true;
  if (/\bwhat (are you|you) seeing\b/.test(t)) return true;
  if (/\bwhat('s| is) (this|the chart|happening|going on|on the chart)\b/.test(t)) return true;
  if (/\b(your|any|a|the) (read|opinion|take|view|thoughts)\b/.test(t)) return true;
  if (/\bhow (does|do) (this|the chart|it) look\b/.test(t)) return true;
  if (/\b(tell me|talk me through|walk me through) (about )?(the )?(chart|setup|this)\b/.test(t)) {
    return true;
  }
  if (/\b(quick|live) (read|look)\b/.test(t)) return true;
  if (/\bis this (a )?(good )?(setup|trade|long|short)\b/.test(t)) return true;
  if (
    /\b(should i|would you)\b/.test(t) &&
    /\b(trade|buy|sell|long|short|take it|this setup)\b/.test(t)
  ) {
    return true;
  }
  if (/\banaly[sz]e\b/.test(t) && /\b(chart|setup|this|mnq|market)\b/.test(t)) return true;
  if (/\bwhat do you think\b/.test(t)) return true;
  if (/\brefresh (the )?read\b/.test(t)) return true;
  if (/\b(pull|grab|load|show)\s+(the\s+)?chart\b/.test(t)) return true;

  return false;
}
