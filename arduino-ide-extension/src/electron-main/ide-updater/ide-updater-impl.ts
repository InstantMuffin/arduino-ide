import { injectable } from '@theia/core/shared/inversify';
import { UpdateInfo, CancellationToken, autoUpdater } from 'electron-updater';
import fetch, { Response } from 'node-fetch';
import { UpdateChannel } from '../../browser/arduino-preferences';
import {
  IDEUpdater,
  IDEUpdaterClient,
} from '../../common/protocol/ide-updater';

const CHANGELOG_BASE_URL = 'https://downloads.arduino.cc/arduino-ide/changelog';

@injectable()
export class IDEUpdaterImpl implements IDEUpdater {
  private isAlreadyChecked = false;
  private updater = autoUpdater;
  private cancellationToken?: CancellationToken;
  protected theiaFEClient?: IDEUpdaterClient;
  protected clients: Array<IDEUpdaterClient> = [];

  constructor() {
    this.updater.on('checking-for-update', (e) => {
      this.clients.forEach((c) => c.notifyCheckingForUpdate(e));
    });
    this.updater.on('update-available', (e) => {
      this.clients.forEach((c) => c.notifyUpdateAvailable(e));
    });
    this.updater.on('update-not-available', (e) => {
      this.clients.forEach((c) => c.notifyUpdateNotAvailable(e));
    });
    this.updater.on('download-progress', (e) => {
      this.clients.forEach((c) => c.notifyDownloadProgressChanged(e));
    });
    this.updater.on('update-downloaded', (e) => {
      this.clients.forEach((c) => c.notifyDownloadFinished(e));
    });
    this.updater.on('error', (e) => {
      this.clients.forEach((c) => c.notifyError(e));
    });
  }

  async init(channel: UpdateChannel, baseUrl: string): Promise<void> {
    this.updater.autoDownload = false;
    this.updater.channel = channel;
    this.updater.setFeedURL({
      provider: 'generic',
      url: `${baseUrl}/${channel === UpdateChannel.Nightly ? 'nightly' : ''}`,
      channel,
    });
  }

  setClient(client: IDEUpdaterClient | undefined): void {
    if (client) this.clients.push(client);
  }

  async checkForUpdates(initialCheck?: boolean): Promise<UpdateInfo | void> {
    if (initialCheck) {
      if (this.isAlreadyChecked) return Promise.resolve();
      this.isAlreadyChecked = true;
    }

    const {
      updateInfo,
      cancellationToken,
    } = await this.updater.checkForUpdates();

    this.cancellationToken = cancellationToken;
    if (this.updater.currentVersion.compare(updateInfo.version) === -1) {
      /*
        'latest.txt' points to the latest changelog that has been generated by the CI,
        so we need to make a first GET request to get the filename of the changelog
        and a second GET to the actual changelog file
      */
      try {
        let response: Response | null = await fetch(
          `${CHANGELOG_BASE_URL}/latest.txt`
        );
        const latestChangelogFileName = response.ok
          ? await response.text()
          : null;
        response = latestChangelogFileName
          ? await fetch(`${CHANGELOG_BASE_URL}/${latestChangelogFileName}`)
          : null;
        const changelog = response?.ok ? await response?.text() : null;
        const currentVersionHeader = `\n\n---\n\n## ${this.updater.currentVersion}\n\n`;
        // We only want to see the release notes of newer versions
        const currentVersionIndex = changelog?.indexOf(currentVersionHeader);
        const newChangelog =
          currentVersionIndex && currentVersionIndex > 0
            ? changelog?.slice(0, currentVersionIndex)
            : changelog;
        updateInfo.releaseNotes = newChangelog;
      } catch {
        /*
          if the request for the changelog fails, we'll just avoid to show it
          to the user, but we will still show the update info
        */
      }
      return updateInfo;
    }
  }

  async downloadUpdate(): Promise<void> {
    try {
      await this.updater.downloadUpdate(this.cancellationToken);
    } catch (e) {
      if (e.message === 'cancelled') return;
      this.clients.forEach((c) => c.notifyError(e));
    }
  }

  stopDownload(): void {
    this.cancellationToken?.cancel();
  }

  quitAndInstall(): void {
    this.updater.quitAndInstall();
  }

  disconnectClient(client: IDEUpdaterClient): void {
    const index = this.clients.indexOf(client);
    if (index !== -1) {
      this.clients.splice(index, 1);
    }
  }

  dispose(): void {
    this.clients.forEach(this.disconnectClient.bind(this));
  }
}
