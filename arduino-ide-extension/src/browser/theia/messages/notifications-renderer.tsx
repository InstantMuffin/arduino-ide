import * as React from '@theia/core/shared/react';
import * as ReactDOM from '@theia/core/shared/react-dom';
import { injectable } from '@theia/core/shared/inversify';
import { NotificationCenterComponent } from './notification-center-component';
import { NotificationToastsComponent } from './notification-toasts-component';
import { NotificationsRenderer as TheiaNotificationsRenderer } from '@theia/messages/lib/browser/notifications-renderer';

@injectable()
export class NotificationsRenderer extends TheiaNotificationsRenderer {
  protected override render(): void {
    ReactDOM.render(
      <div>
        <NotificationToastsComponent
          manager={this.manager}
          corePreferences={this.corePreferences}
        />
        <NotificationCenterComponent manager={this.manager} />
      </div>,
      this.container
    );
  }
}
