import * as React from '@theia/core/shared/react';
import * as ReactDOM from '@theia/core/shared/react-dom';
import { inject, injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common/nls';
import { Widget } from '@theia/core/shared/@phosphor/widgets';
import { Message, MessageLoop } from '@theia/core/shared/@phosphor/messaging';
import { Disposable } from '@theia/core/lib/common/disposable';
import { BaseWidget } from '@theia/core/lib/browser/widgets/widget';
import { CommandService } from '@theia/core/lib/common/command';
import { SketchbookTreeWidget } from './sketchbook-tree-widget';
import { CreateNew } from '../sketchbook/create-new';

@injectable()
export abstract class BaseSketchbookCompositeWidget<
  TW extends SketchbookTreeWidget
> extends BaseWidget {
  @inject(CommandService)
  protected readonly commandService: CommandService;

  private readonly compositeNode: HTMLElement;
  private readonly footerNode: HTMLElement;

  constructor() {
    super();
    this.compositeNode = document.createElement('div');
    this.compositeNode.classList.add('composite-node');
    this.footerNode = document.createElement('div');
    this.footerNode.classList.add('footer-node');
    this.compositeNode.appendChild(this.footerNode);
    this.node.appendChild(this.compositeNode);
    this.title.closable = false;
  }

  abstract get treeWidget(): TW;
  protected abstract renderFooter(footerNode: HTMLElement): void;
  protected updateFooter(): void {
    this.renderFooter(this.footerNode);
  }

  protected override onAfterAttach(message: Message): void {
    super.onAfterAttach(message);
    Widget.attach(this.treeWidget, this.compositeNode);
    this.renderFooter(this.footerNode);
    this.toDisposeOnDetach.push(
      Disposable.create(() => Widget.detach(this.treeWidget))
    );
  }

  protected override onActivateRequest(message: Message): void {
    super.onActivateRequest(message);
    // Sending a resize message is needed because otherwise the tree widget would render empty
    this.onResize(Widget.ResizeMessage.UnknownSize);
  }

  protected override onResize(message: Widget.ResizeMessage): void {
    super.onResize(message);
    MessageLoop.sendMessage(this.treeWidget, Widget.ResizeMessage.UnknownSize);
  }
}

@injectable()
export class SketchbookCompositeWidget extends BaseSketchbookCompositeWidget<SketchbookTreeWidget> {
  @inject(SketchbookTreeWidget)
  private readonly sketchbookTreeWidget: SketchbookTreeWidget;

  constructor() {
    super();
    this.id = 'sketchbook-composite-widget';
    this.title.caption = nls.localize(
      'arduino/sketch/titleLocalSketchbook',
      'Local Sketchbook'
    );
    this.title.iconClass = 'sketchbook-tree-icon';
  }

  get treeWidget(): SketchbookTreeWidget {
    return this.sketchbookTreeWidget;
  }

  protected renderFooter(footerNode: HTMLElement): void {
    ReactDOM.render(
      <CreateNew
        label={nls.localize('arduino/sketchbook/newSketch', 'New Sketch')}
        onClick={this.onDidClickCreateNew}
      />,
      footerNode
    );
  }

  private onDidClickCreateNew: () => void = () => {
    this.commandService.executeCommand('arduino-new-sketch');
  };
}
