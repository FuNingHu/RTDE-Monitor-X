/// <reference lib="webworker" />
import { OperatorScreenBehaviors, registerOperatorScreenBehavior } from '@universal-robots/contribution-api';

const behaviors: OperatorScreenBehaviors = {
    factory: () => {
        return {
            type: 'funh-rtde-monitor-robot-monitor',
            version: '1.0.0',
            parameters: { page: 'registers' },
        };
    },
};

registerOperatorScreenBehavior(behaviors);
