import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import Parser from '../src/parser';
import { markdownItEngine } from '../src/engines';

describe('Parser', function () {
  context('constructor', function () {
    it("should throw an error if markdownEngine isn't provided", function () {
      expect(()=>new Parser({})).to.throw();
    });

    it('should take an interpolationPoint argument which sets the string for splitting text on interpolations', function () {
      var parser = new Parser({ markdownEngine:()=>{}, interpolationPoint: 'abcdefg' });
      expect(parser._interpolationPoint).to.equal('abcdefg');
    });

    it('should generate a random interpolationPoint if none is given', function () {
      var parser1 = new Parser({ markdownEngine:()=>{} });
      var parser2 = new Parser({ markdownEngine:()=>{} });
      expect(parser1._interpolationPoint.length).to.equal(64);
      expect(parser2._interpolationPoint.length).to.equal(64);
      expect(parser1._interpolationPoint).to.not.equal(parser2._interpolationPoint);
    });
  });

  context('#parse', function () {
    var parse;
    beforeEach(function () {
      var parser = new Parser({ markdownEngine: markdownItEngine() });
      parse = function (text) {
        return parser.parse(text);
      };
    });

    it('should parse a text block', function () {
      var elements = parse('Some text');
      expect(elements).to.be.an('array');
      expect(elements.length).to.equal(1);
      expect(elements[0].type).to.equal('text');
      expect(elements[0].blocks).to.deep.equal(['<p>Some text</p>']);
    });

    it('should parse recursive tags', function () {
      var elements = parse('<Outer a={ x.y }>\n' +
        '  <Inner a=123>\n' +
        '  </Inner>\n' +
        '</Outer>');
      expect(elements).to.be.an('array');
      expect(elements.length).to.equal(1);
      expect(elements[0].type).to.equal('tag');
      expect(elements[0].name).to.equal('outer');
      expect(elements[0].children.length).to.equal(1);
      expect(elements[0].children[0].name).to.equal('inner');
    });

    it('should parse tags with no spaces', function () {
      var elements = parse('<Outer><inner></inner></outer>');
      expect(elements).to.be.an('array');
      expect(elements[0].name).to.equal('outer');
      expect(elements[0].children[0].name).to.equal('inner');
    });

    it('should correctly parse an interpolation followed by a tag', function () {
      var elements = parse('<Outer>{test}<inner></inner></outer>');
      expect(elements).to.be.an('array');
      expect(elements[0].name).to.equal('outer');
      expect(elements[0].children[0].type).to.equal('text');
      expect(elements[0].children[1].name).to.equal('inner');
    });

    context('indentation', function () {
      it('should treat indented markdown as a code block when indentedMarkdown=false', function () {
        var parser = new Parser({
          indentedMarkdown: false,
          markdownEngine: markdownItEngine()
        });
        var elements = parser.parse(
          '    # Heading\n' +
          '    Some text\n'
        );

        expect(elements[0]).to.deep.equal({
          type: 'text',
          blocks: ['<pre><code># Heading\nSome text\n</code></pre>']
        });
      });

      it('should parse markdown using the indentation of the first line if indentedMarkdown is true', function () {
        var parser = new Parser({
          indentedMarkdown: true,
          markdownEngine: markdownItEngine()
        });
        var elements = parser.parse(
          '    # Heading\n' +
          '    Some text\n'
        );
        expect(elements[0]).to.deep.equal({
          type: 'text',
          blocks: ['<h1>Heading</h1>\n<p>Some text</p>']
        });
      });

      it('should parse indented markdown in a tag body', function () {
        var parser = new Parser({
          indentedMarkdown: true,
          markdownEngine: markdownItEngine()
        });
        var elements = parser.parse(
          '<mytag>\n' +
          '    # Heading\n' +
          '    Some text\n' +
          '</mytag>\n'
        );
        expect(elements[0].children).to.deep.equal([
          {
            type: 'text',
            blocks: ['<h1>Heading</h1>\n<p>Some text</p>']
          }
        ]);
      });

      context('when invalid indentation is encountered,', function () {

        it('should detect invalid indentation (if indentedMarkdown is true)', function () {
          var testFn;
          var parser = new Parser({
            indentedMarkdown: true,             // TRUE
            markdownEngine: markdownItEngine()
          });

          var testFn = ()=>parser.parse(
            '     # Here is some indented markdown\n'+
            '     with some valid text\n' +
            '   and some invalid dedented text\n'+
            '     and some valid indented text'
          );
          expect(testFn).to.throw(Error, 'Bad indentation in text block at 3:4');
        });

        it('should ignore indentation if indentedMarkdown is false', function () {
          var testFn;
          var parser = new Parser({
            indentedMarkdown: false,            // FALSE
            markdownEngine: markdownItEngine()
          });

          var testFn = ()=>parser.parse(
            '     # Here is some indented markdown\n'+
            '     with some valid text\n' +
            '   and some invalid dedented text'+
            '     and some valid indented text'
          );
          expect(testFn).to.not.throw();
        });
      });
    });

    it('should parse interpolation only', function () {
      var elements = parse('{ someVar }');
      expect(elements).to.be.an('array');
      expect(elements[0].type).to.equal('text');
      expect(elements[0].blocks).to.deep.equal([
        '<p>',
        { type: 'interpolation', accessor: 'someVar' },
        '</p>'
      ]);
    });

    context('with bad input', function () {
      it("should throw an error if closing tag isn't present", function () {
        expect(()=>parse('<outer><inner></inner>')).to.throw();
      });

      it('should throw an error if invalid closing tag is encountered', function () {
        expect(()=>parse('<outer><inner></outer>')).to.throw();
      });

      it('should throw an error if an invalid attribute is given', function () {
        expect(()=>parse('<tag a=1 b=[123]></tag>')).to.throw();
        expect(()=>parse("<tag a=1 b='123'></tag>")).to.throw();
      });

      it('should throw an error if an attribute interpolation is unclosed', function () {
        expect(()=>parse('<tag a={></tag>')).to.throw();
      });

      it('should throw an error if the tag end brace is missing', function () {
        expect(()=>parse('<tag</tag>')).to.throw();
      });
    });

    context('with complex input', function () {
      var parseResult;
      beforeEach(function () {
        const example = fs.readFileSync(path.join(__dirname, 'example.md'));
        parseResult = parse(example);
      });

      it('should return an array containing objects representing the parsed HTML tree', function () {
        expect(parseResult).to.be.an('array');
        expect(parseResult.length).to.equal(5);
      });

      it('should interpolate into markdown', function () {
        expect(parseResult[0].type).to.equal('text');
        expect(parseResult[0].blocks).to.deep.equal([
          '<h1>heading1</h1>\n<p>Text after and interpolation ',
          { type: 'interpolation', accessor: 'x.y' },
          ' heading1</p>'
        ]);
      });

      it('should parse a tag within markdown', function () {
        expect(parseResult[1].type).to.equal('tag');
        expect(parseResult[1].name).to.equal('div');
        expect(parseResult[1].children.length).to.equal(1);
      });

      it('should parse a self closing tag', function () {
        expect(parseResult[2].type).to.equal('tag');
        expect(parseResult[2].name).to.equal('selfclosing');
      });

      it('should parse number, string and interpolated attributes from a component', function () {
        expect(parseResult[4].type).to.equal('tag');
        expect(parseResult[4].name).to.equal('mycomponent');
        expect(parseResult[4].attrs).to.deep.equal({
          a: 1, b: 'string', c: { type: 'interpolation', accessor: 'x.y' }
        });
        expect(parseResult[4].children.length).to.equal(2);
      });

      it('should handle curly and angle escapes', function () {
        expect(parseResult[4].children[0]).to.deep.equal({
          type: 'text',
          blocks: [
            '<p>Text inside MyComponent\n' +
            'With escaped chars: { &lt; } &gt;</p>\n' +
            '<ul>\n'+
            '<li>listElt1</li>\n' +
            '<li>listElt2</li>\n' +
            '</ul>'
          ]
        });
        expect(parseResult[4].children[1].type).to.equal('tag');
        expect(parseResult[4].children[1].name).to.equal('subcomponent');
      });
    });
  });
});
