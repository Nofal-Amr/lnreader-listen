package com.margelo.nitro.nitrotts

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Handler
import android.os.SystemClock
import kotlin.math.sqrt

/**
 * Sleep timer (minutes / end of chapter / N chapters) with a volume fade and
 * shake-to-extend. Runs on native Handler callbacks so it keeps working with
 * the screen off, where React Native timers stall.
 */
internal class SleepTimerController(
    private val handler: Handler,
    private val onExpire: () -> Unit,
    private val onChange: (TtsSleepTimerState) -> Unit,
) {
    private var mode = TtsSleepTimerMode.MINUTES
    private var active = false
    private var endsAt = 0L
    private var chaptersLeft = 0
    private var sensorManager: SensorManager? = null
    private var lastShakeAt = 0L

    private val tick = object : Runnable {
        override fun run() {
            if (!active || mode != TtsSleepTimerMode.MINUTES) return
            if (remainingMs() <= 0) {
                expire()
                return
            }
            emit()
            handler.postDelayed(this, 1_000L)
        }
    }

    private val shakeListener = object : SensorEventListener {
        override fun onSensorChanged(event: SensorEvent) {
            val x = event.values[0]
            val y = event.values[1]
            val z = event.values[2]
            val gForce = sqrt(x * x + y * y + z * z) / SensorManager.GRAVITY_EARTH
            val now = SystemClock.elapsedRealtime()
            if (gForce > SHAKE_G && now - lastShakeAt > 1_500L) {
                lastShakeAt = now
                handler.post { extend() }
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
    }

    fun start(context: Context, timer: TtsSleepTimer) {
        cancel(notify = false)
        mode = timer.mode
        active = true
        when (mode) {
            TtsSleepTimerMode.MINUTES -> {
                endsAt = SystemClock.elapsedRealtime() + (timer.value * 60_000.0).toLong()
                handler.post(tick)
            }
            TtsSleepTimerMode.ENDOFCHAPTER -> chaptersLeft = 1
            TtsSleepTimerMode.CHAPTERS -> chaptersLeft = timer.value.toInt().coerceAtLeast(1)
        }
        if (timer.shakeToExtend) registerShake(context)
        emit()
    }

    fun cancel(notify: Boolean = true) {
        val wasActive = active
        active = false
        handler.removeCallbacks(tick)
        unregisterShake()
        if (notify && wasActive) emit()
    }

    /** Called at every chapter boundary; true means playback must pause there. */
    fun consumeChapter(): Boolean {
        if (!active || mode == TtsSleepTimerMode.MINUTES) return false
        chaptersLeft -= 1
        if (chaptersLeft <= 0) {
            cancel()
            return true
        }
        emit()
        return false
    }

    /** Utterance volume: fades over the last [FADE_MS] of a minutes timer. */
    fun volume(): Float {
        if (!active || mode != TtsSleepTimerMode.MINUTES) return 1f
        val left = remainingMs()
        if (left >= FADE_MS) return 1f
        return (left.toFloat() / FADE_MS).coerceIn(0.15f, 1f)
    }

    fun state(): TtsSleepTimerState = TtsSleepTimerState(
        active = active,
        mode = mode,
        remainingMs = if (active && mode == TtsSleepTimerMode.MINUTES) remainingMs().toDouble() else 0.0,
        remainingChapters = if (active && mode != TtsSleepTimerMode.MINUTES) chaptersLeft.toDouble() else 0.0,
    )

    private fun extend() {
        if (!active) return
        when (mode) {
            TtsSleepTimerMode.MINUTES -> endsAt = maxOf(endsAt, SystemClock.elapsedRealtime()) + EXTEND_MS
            else -> chaptersLeft += 1
        }
        emit()
    }

    private fun expire() {
        cancel()
        onExpire()
    }

    private fun remainingMs(): Long = (endsAt - SystemClock.elapsedRealtime()).coerceAtLeast(0L)

    private fun emit() = onChange(state())

    private fun registerShake(context: Context) {
        val manager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
        val sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return
        manager.registerListener(shakeListener, sensor, SensorManager.SENSOR_DELAY_UI, handler)
        sensorManager = manager
    }

    private fun unregisterShake() {
        sensorManager?.unregisterListener(shakeListener)
        sensorManager = null
    }

    private companion object {
        const val FADE_MS = 15_000L
        const val EXTEND_MS = 10 * 60_000L
        const val SHAKE_G = 2.6f
    }
}
