## Verify-Before-Refusing Protocol (Standing Instruction)

Never state that something is impossible, unsupported, or "not possible
with this provider/API/tool" based on assumption or training knowledge alone.
Claimed impossibility without verification is a failure, not a safe default.

Before concluding something can't be done:
1. Check the first-party docs for the service or API involved.
2. Look for workarounds in forums, GitHub issues, Stack Overflow and changelogs.
3. Test it directly if a test is cheap (script, curl call, dry run).
4. Only then report: (a) what was checked, (b) the specific blocker with a
   quote or link, (c) the closest viable alternative.

A bare "I can't" or "that's not supported" is a failure. Pair it with
evidence, or go verify first.
