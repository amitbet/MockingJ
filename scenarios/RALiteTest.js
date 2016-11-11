
var LFT = require('leanft');
var SDK = LFT.SDK;
var Web = LFT.Web;
var whenDone = LFT.whenDone;
describe('demo', function () {
    var browser;
    beforeEach(function (done) {
        SDK.init({
            'address': 'ws://' + process.env.LEANFT_HOST + ':' + process.env.LEANFT_PORT,
            'environmentId': process.env.SRF_ACCESS_KEY
        });
        Web.Browser.launch('chrome').then(function (b) {
            browser = b;
        })
        whenDone(done);
    });

    it('should work', function (done) {
        browser.navigate('http://www.ebay.com/');

        var _nkw1 = browser.$(Web.Edit({ xpath: '//INPUT[@id=\"gh-ac\"]', tagName: 'INPUT', name: '_nkw', type: 'text' }));
        _nkw1.setValue('3d printer');

        var search2 = browser.$(Web.Button({ xpath: '//INPUT[@id=\"gh-btn\"]', tagName: 'INPUT', name: 'Search', buttonType: 'submit' }));
        search2.click();

        var auction3 = browser.$(Web.Link({ xpath: '//DIV[@id=\"cbelm\"]/DIV/DIV/A[normalize-space()=\"Auction\"]', tagName: 'A', innerText: 'Auction' }));
        auction3.click();



        whenDone(done);
    });

    afterEach(function (done) {
        SDK.cleanup();
        whenDone(done);
    })
});