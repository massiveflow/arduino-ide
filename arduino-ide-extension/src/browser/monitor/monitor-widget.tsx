import * as React from 'react';
import * as dateFormat from 'dateformat';
import { postConstruct, injectable, inject } from 'inversify';
import { OptionsType } from 'react-select/src/types';
import { isOSX } from '@theia/core/lib/common/os';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { Key, KeyCode } from '@theia/core/lib/browser/keys';
import { DisposableCollection } from '@theia/core/lib/common/disposable'
import { ReactWidget, Message, Widget } from '@theia/core/lib/browser/widgets';
import { Board, Port } from '../../common/protocol/boards-service';
import { MonitorConfig } from '../../common/protocol/monitor-service';
import { ArduinoSelect } from '../components/arduino-select';
import { MonitorModel } from './monitor-model';
import { MonitorConnection } from './monitor-connection';
import { MonitorServiceClientImpl } from './monitor-service-client-impl';

@injectable()
export class MonitorWidget extends ReactWidget {

    static readonly ID = 'serial-monitor';

    @inject(MonitorModel)
    protected readonly monitorModel: MonitorModel;

    @inject(MonitorConnection)
    protected readonly monitorConnection: MonitorConnection;

    @inject(MonitorServiceClientImpl)
    protected readonly monitorServiceClient: MonitorServiceClientImpl;

    protected widgetHeight: number;

    /**
     * Do not touch or use it. It is for setting the focus on the `input` after the widget activation.
     */
    protected focusNode: HTMLElement | undefined;
    protected readonly clearOutputEmitter = new Emitter<void>();

    constructor() {
        super();
        this.id = MonitorWidget.ID;
        this.title.label = 'Serial Monitor';
        this.title.iconClass = 'arduino-serial-monitor-tab-icon';
        this.scrollOptions = undefined;
        this.toDispose.push(this.clearOutputEmitter);
    }

    @postConstruct()
    protected init(): void {
        this.update();
        this.toDispose.push(this.monitorConnection.onConnectionChanged(() => this.clearConsole()));
    }

    clearConsole(): void {
        this.clearOutputEmitter.fire(undefined);
        this.update();
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.monitorConnection.autoConnect = true;
    }

    protected onBeforeDetach(msg: Message): void {
        super.onBeforeDetach(msg);
        this.monitorConnection.autoConnect = false;
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        this.widgetHeight = msg.height;
        this.update();
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        (this.focusNode || this.node).focus();
    }

    protected onFocusResolved = (element: HTMLElement | undefined) => {
        this.focusNode = element;
    }

    protected get lineEndings(): OptionsType<SelectOption<MonitorModel.EOL>> {
        return [
            {
                label: 'No Line Ending',
                value: ''
            },
            {
                label: 'Newline',
                value: '\n'
            },
            {
                label: 'Carriage Return',
                value: '\r'
            },
            {
                label: 'Both NL & CR',
                value: '\r\n'
            }
        ]
    }

    protected get baudRates(): OptionsType<SelectOption<MonitorConfig.BaudRate>> {
        const baudRates: Array<MonitorConfig.BaudRate> = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200];
        return baudRates.map(baudRate => ({ label: baudRate + ' baud', value: baudRate }));
    }

    protected render(): React.ReactNode {
        const { baudRates, lineEndings } = this;
        const lineEnding = lineEndings.find(item => item.value === this.monitorModel.lineEnding) || lineEndings[1]; // Defaults to `\n`.
        const baudRate = baudRates.find(item => item.value === this.monitorModel.baudRate) || baudRates[4]; // Defaults to `9600`.
        return <div className='serial-monitor-container'>
            <div className='head'>
                <div className='send'>
                    <SerialMonitorSendField
                        monitorConfig={this.monitorConnection.monitorConfig}
                        resolveFocus={this.onFocusResolved}
                        onSend={this.onSend} />
                </div>
                <div className='config'>
                    <ArduinoSelect
                        maxMenuHeight={this.widgetHeight - 40}
                        options={lineEndings}
                        defaultValue={lineEnding}
                        onChange={this.onChangeLineEnding} />,
                    <ArduinoSelect
                        maxMenuHeight={this.widgetHeight - 40}
                        options={baudRates}
                        defaultValue={baudRate}
                        onChange={this.onChangeBaudRate} />
                </div>
            </div>
            <div id='serial-monitor-output-container'>
                <SerialMonitorOutput
                    monitorModel={this.monitorModel}
                    monitorServiceClient={this.monitorServiceClient}
                    clearConsoleEvent={this.clearOutputEmitter.event} />
            </div>
        </div>;
    }

    protected readonly onSend = (value: string) => this.doSend(value);
    protected async doSend(value: string): Promise<void> {
        this.monitorConnection.send(value);
    }

    protected readonly onChangeLineEnding = (option: SelectOption<MonitorModel.EOL>) => {
        this.monitorModel.lineEnding = option.value;
    }

    protected readonly onChangeBaudRate = async (option: SelectOption<MonitorConfig.BaudRate>) => {
        await this.monitorConnection.disconnect();
        this.monitorModel.baudRate = option.value;
    }

}

export namespace SerialMonitorSendField {
    export interface Props {
        readonly monitorConfig?: MonitorConfig;
        readonly onSend: (text: string) => void;
        readonly resolveFocus: (element: HTMLElement | undefined) => void;
    }
    export interface State {
        value: string;
    }
}

export class SerialMonitorSendField extends React.Component<SerialMonitorSendField.Props, SerialMonitorSendField.State> {

    constructor(props: SerialMonitorSendField.Props) {
        super(props);
        this.state = { value: '' };
        this.onChange = this.onChange.bind(this);
        this.onSend = this.onSend.bind(this);
        this.onKeyDown = this.onKeyDown.bind(this);
    }

    render(): React.ReactNode {
        return <React.Fragment>
            <input
                ref={this.setRef}
                type='text'
                className={this.props.monitorConfig ? '' : 'not-connected'}
                placeholder={this.placeholder}
                value={this.state.value}
                onChange={this.onChange}
                onKeyDown={this.onKeyDown} />
        </React.Fragment>
    }

    protected get placeholder(): string {
        const { monitorConfig } = this.props;
        if (!monitorConfig) {
            return 'Not connected. Select a board and a port to connect automatically.'
        }
        const { board, port } = monitorConfig;
        return `Message (${isOSX ? '⌘' : 'Ctrl'}+Enter to send message to '${Board.toString(board, { useFqbn: false })}' on '${Port.toString(port)}')`;
    }

    protected setRef = (element: HTMLElement | null) => {
        if (this.props.resolveFocus) {
            this.props.resolveFocus(element || undefined);
        }
    }

    protected onChange(event: React.ChangeEvent<HTMLInputElement>): void {
        this.setState({ value: event.target.value });
    }

    protected onSend(): void {
        this.props.onSend(this.state.value);
        this.setState({ value: '' });
    }

    protected onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
        const keyCode = KeyCode.createKeyCode(event.nativeEvent);
        if (keyCode) {
            const { key, meta, ctrl } = keyCode;
            if (key === Key.ENTER && ((isOSX && meta) || (!isOSX && ctrl))) {
                this.onSend();
            }
        }
    }

}

export namespace SerialMonitorOutput {
    export interface Props {
        readonly monitorServiceClient: MonitorServiceClientImpl;
        readonly monitorModel: MonitorModel;
        readonly clearConsoleEvent: Event<void>;
    }
    export interface State {
        content: string;
    }
}

export class SerialMonitorOutput extends React.Component<SerialMonitorOutput.Props, SerialMonitorOutput.State> {

    /**
     * Do not touch it. It is used to be able to "follow" the serial monitor log.
     */
    protected anchor: HTMLElement | null;
    protected toDisposeBeforeUnmount = new DisposableCollection();

    constructor(props: Readonly<SerialMonitorOutput.Props>) {
        super(props);
        this.state = { content: '' };
    }

    render(): React.ReactNode {
        return <React.Fragment>
            <div style={({ whiteSpace: 'pre', fontFamily: 'monospace' })}>
                {this.state.content}
            </div>
            <div style={{ float: 'left', clear: 'both' }} ref={element => { this.anchor = element; }} />
        </React.Fragment>;
    }

    componentDidMount(): void {
        this.scrollToBottom();
        let chunk = '';
        this.toDisposeBeforeUnmount.pushAll([
            this.props.monitorServiceClient.onRead(({ data }) => {
                chunk += data;
                const eolIndex = chunk.indexOf('\n');
                if (eolIndex !== -1) {
                    const line = chunk.substring(0, eolIndex + 1);
                    chunk = chunk.slice(eolIndex + 1);
                    const content = `${this.state.content}${false ? `${dateFormat(new Date(), 'H:M:ss.l')} -> ` : ''}${line}`;
                    this.setState({ content });
                }
            }),
            this.props.clearConsoleEvent(() => this.setState({ content: '' }))
        ]);
    }

    componentDidUpdate(): void {
        this.scrollToBottom();
    }

    componentWillUnmount(): void {
        this.toDisposeBeforeUnmount.dispose()
    }

    protected scrollToBottom(): void {
        if (this.props.monitorModel.autoscroll && this.anchor) {
            this.anchor.scrollIntoView();
        }
    }

}

export interface SelectOption<T> {
    readonly label: string;
    readonly value: T;
}
