import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RTDE_GUIDE_URL } from '../../constant';

@Component({
    selector: 'app-rtde-unavailable-dialog',
    templateUrl: './rtde-unavailable-dialog.component.html',
    styleUrls: ['./rtde-unavailable-dialog.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    standalone: false,
})
export class RtdeUnavailableDialogComponent {
    readonly fields = input<readonly string[]>([]);
    readonly dismiss = output<void>();
    readonly guideUrl = RTDE_GUIDE_URL;
}
