import NitroModules

final class HybridTtsSession: HybridTtsSessionSpec {
  private let coordinator = TtsPlaybackCoordinator.shared

  func load(
    paragraphs: [TtsParagraph],
    initialIndex: Double,
    metadata: TtsMetadata,
    settings: TtsSettings
  ) throws -> Promise<Void> {
    return MainQueuePromise.run {
      try self.coordinator.load(
        paragraphs: paragraphs,
        initialIndex: Int(initialIndex),
        metadata: metadata,
        settings: settings
      )
    }
  }

  func play() throws -> Promise<Void> {
    return MainQueuePromise.run(coordinator.play)
  }

  func pause() throws -> Promise<Void> {
    return MainQueuePromise.run(coordinator.pause)
  }

  func stop() throws -> Promise<Void> {
    return MainQueuePromise.run(coordinator.stop)
  }

  func skipPrevious() throws -> Promise<Void> {
    return MainQueuePromise.run(coordinator.skipPrevious)
  }

  func skipNext() throws -> Promise<Void> {
    return MainQueuePromise.run(coordinator.skipNext)
  }

  func replayCurrent() throws -> Promise<Void> {
    return MainQueuePromise.run(coordinator.replayCurrent)
  }

  func seekTo(index: Double) throws -> Promise<Void> {
    return MainQueuePromise.run {
      self.coordinator.seekTo(index: Int(index))
    }
  }

  func updateSettings(settings: TtsSettings) throws -> Promise<Void> {
    return MainQueuePromise.run {
      self.coordinator.updateSettings(settings)
    }
  }

  // Chapter queueing is Android-only; iOS is not shipped by this fork.
  func appendChapter(chapter: TtsChapter) throws -> Promise<Void> {
    return Promise.resolved()
  }

  func clearUpcoming() throws -> Promise<Void> {
    return Promise.resolved()
  }

  func setSleepTimer(timer: TtsSleepTimer) throws -> Promise<Void> {
    return Promise.resolved()
  }

  func cancelSleepTimer() throws -> Promise<Void> {
    return Promise.resolved()
  }

  func addOnSleepTimerChangedListener(
    listener: @escaping (_ state: TtsSleepTimerState) -> Void
  ) throws -> ListenerSubscription {
    return ListenerSubscription(remove: {})
  }

  func addOnChapterChangedListener(
    listener: @escaping (_ chapterId: String) -> Void
  ) throws -> ListenerSubscription {
    return ListenerSubscription(remove: {})
  }

  func addOnStateChangedListener(
    listener: @escaping (TtsPlaybackState) -> Void
  ) throws -> ListenerSubscription {
    return ListenerSubscription(remove: coordinator.addStateListener(listener))
  }

  func addOnProgressChangedListener(
    listener: @escaping (TtsProgress) -> Void
  ) throws -> ListenerSubscription {
    return ListenerSubscription(remove: coordinator.addProgressListener(listener))
  }

  func addOnErrorListener(
    listener: @escaping (String) -> Void
  ) throws -> ListenerSubscription {
    return ListenerSubscription(remove: coordinator.addErrorListener(listener))
  }
}
