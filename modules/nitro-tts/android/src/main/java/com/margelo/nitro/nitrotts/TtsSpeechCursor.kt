package com.margelo.nitro.nitrotts

/** What an utterance ends on; picks the silence that follows it. */
internal enum class BoundaryKind { CLAUSE, SENTENCE, PARAGRAPH }

/**
 * Offset math over a paragraph's clause/sentence breaks (computed in JS).
 * Speech goes one sentence per utterance so the engine keeps natural prosody;
 * clause offsets are only used to split when a comma pause is set, and to
 * rewind/forward mid-sentence.
 */
internal object TtsSpeechCursor {
    // Roughly one second of speech: rewinding later than this into a unit
    // restarts it, earlier jumps to the unit before, like a music player.
    private const val RESTART_THRESHOLD_CHARS = 15

    private fun breaksOf(paragraph: TtsParagraph): List<TtsBreak> =
        paragraph.breaks?.sortedBy { it.offset } ?: emptyList()

    // Engines reject very long input (Android caps it near 4000 characters).
    private const val MAX_UTTERANCE_CHARS = 3000

    /**
     * End (exclusive) of the utterance starting at [from], and the boundary it ends on.
     * Without sentence/clause pauses the whole paragraph is one utterance: no gap
     * between sentences, and the voice hears the full context (better "?" / "!" tone).
     */
    fun utteranceEnd(
        paragraph: TtsParagraph,
        from: Int,
        splitClauses: Boolean,
        splitSentences: Boolean = true,
    ): Pair<Int, BoundaryKind> {
        var lastSentence = -1
        for (b in breaksOf(paragraph)) {
            val offset = b.offset.toInt()
            if (offset <= from || offset >= paragraph.text.length) continue
            val tooLong = offset - from > MAX_UTTERANCE_CHARS
            if (tooLong && lastSentence > from) return lastSentence to BoundaryKind.SENTENCE
            if (b.kind == TtsBreakKind.SENTENCE) {
                if (splitSentences || tooLong) return offset to BoundaryKind.SENTENCE
                lastSentence = offset
            } else if (splitClauses || (tooLong && lastSentence <= from)) {
                return offset to BoundaryKind.CLAUSE
            }
        }
        if (paragraph.text.length - from > MAX_UTTERANCE_CHARS && lastSentence > from) {
            return lastSentence to BoundaryKind.SENTENCE
        }
        return paragraph.text.length to BoundaryKind.PARAGRAPH
    }

    /** Start offsets of every [unit] in the paragraph, ascending, always beginning with 0. */
    fun unitStarts(paragraph: TtsParagraph, unit: TtsSkipUnit): List<Int> {
        if (unit == TtsSkipUnit.PARAGRAPH) return listOf(0)
        val starts = breaksOf(paragraph)
            .filter { unit == TtsSkipUnit.CLAUSE || it.kind == TtsBreakKind.SENTENCE }
            .map { it.offset.toInt() }
            .filter { it in 1 until paragraph.text.length }
        return (listOf(0) + starts).distinct()
    }

    /**
     * Where rewinding from [position] lands inside the paragraph, or null when it
     * should move into the previous paragraph.
     */
    fun previousStart(paragraph: TtsParagraph, position: Int, unit: TtsSkipUnit): Int? {
        val starts = unitStarts(paragraph, unit)
        val current = starts.indexOfLast { it <= position }.coerceAtLeast(0)
        if (position - starts[current] > RESTART_THRESHOLD_CHARS) return starts[current]
        return if (current > 0) starts[current - 1] else null
    }

    /** Where forward from [position] lands, or null when it should move to the next paragraph. */
    fun nextStart(paragraph: TtsParagraph, position: Int, unit: TtsSkipUnit): Int? =
        unitStarts(paragraph, unit).firstOrNull { it > position }

    /** Start of the last [unit] of the paragraph (used when rewinding into it). */
    fun lastStart(paragraph: TtsParagraph, unit: TtsSkipUnit): Int =
        unitStarts(paragraph, unit).last()
}
