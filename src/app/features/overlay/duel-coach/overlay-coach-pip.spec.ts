import { OverlayPipShell, OverlayPipSnapshot } from '../overlay-pip-shell';

describe('Coach mount inside the existing card overlay', () => {
  let descriptor: PropertyDescriptor | undefined;
  beforeEach(() => { descriptor = Object.getOwnPropertyDescriptor(window,'documentPictureInPicture'); });
  afterEach(() => {
    if (descriptor) Object.defineProperty(window,'documentPictureInPicture',descriptor);
    else Reflect.deleteProperty(window,'documentPictureInPicture');
  });
  it('preserves the mounted panel and its state across card redraws and collapse/expand', async () => {
    const doc = document.implementation.createHTMLDocument('Coach');
    const popup = { document: doc,closed: false,resizeTo: jasmine.createSpy('resize'),addEventListener: jasmine.createSpy('listen'),close: jasmine.createSpy('close') };
    Object.defineProperty(window,'documentPictureInPicture',{ configurable: true,value: { requestWindow: () => Promise.resolve(popup) } });
    const shell = new OverlayPipShell();
    expect(await shell.openWindow({ onScan: () => {},onCollapse: () => {},onExpand: () => {} })).toBeTrue();
    const panel = doc.createElement('section'); panel.textContent = 'Next: Goblindbergh';
    shell.mountPanel(panel);
    const snapshot: OverlayPipSnapshot = { card: null,legality: null,related: { available: false,tags: [],displayTags: [],series: [],mentions: [],effects: [],suggestions: [],groups: [] },formatName: '',statusText: 'test',scanning: false,collapsed: false,t: key => key };
    shell.render(snapshot); expect(doc.getElementById('pip-root')?.contains(panel)).toBeTrue();
    shell.render({ ...snapshot,collapsed: true });
    shell.render({ ...snapshot,collapsed: false });
    expect(doc.getElementById('pip-root')?.contains(panel)).toBeTrue();
    expect(panel.textContent).toBe('Next: Goblindbergh');
    shell.close(); expect(popup.close).toHaveBeenCalled();
  });
});
