import { normalizeHover, Correlator } from './correlator'
import { ElementTypes, VertexLabels, EdgeLabels, MonikerKind } from 'lsif-protocol'

describe('Correlator', () => {
    it('should stash lsif version and project root from metadata', () => {
        const c = new Correlator()
        c.insert({
            id: '1',
            type: ElementTypes.vertex,
            label: VertexLabels.metaData,
            positionEncoding: 'utf-16',
            version: '0.4.3',
            projectRoot: 'file:///lsif-test',
        })

        const projectRoot = c.projectRoot
        expect(c.lsifVersion).toEqual('0.4.3')
        expect(projectRoot && projectRoot.href).toEqual('file:///lsif-test')
    })

    it('should require metadata vertex before document vertices', () => {
        const c = new Correlator()

        expect(() => {
            c.insert({
                id: '1',
                type: ElementTypes.vertex,
                label: VertexLabels.document,
                uri: 'file:///lsif-test/index.ts',
                languageId: 'typescript',
            })
        }).toThrowError(new Error('No metadata defined.'))
    })

    it('should find root-relative document paths', () => {
        const c = new Correlator()
        c.insert({
            id: '1',
            type: ElementTypes.vertex,
            label: VertexLabels.metaData,
            positionEncoding: 'utf-16',
            version: '0.4.3',
            projectRoot: 'file:///lsif-test',
        })

        c.insert({
            id: '2',
            type: ElementTypes.vertex,
            label: VertexLabels.document,
            uri: 'file:///lsif-test/sub/path/index.ts',
            languageId: 'typescript',
        })

        expect(c.documentPaths).toEqual(new Map([['2', 'sub/path/index.ts']]))
    })

    it('should determine type of item relation the outV property', () => {
        const c = new Correlator()
        c.insert({
            id: '1',
            type: ElementTypes.vertex,
            label: VertexLabels.metaData,
            positionEncoding: 'utf-16',
            version: '0.4.3',
            projectRoot: 'file:///lsif-test',
        })

        c.insert({
            id: '2',
            type: ElementTypes.vertex,
            label: VertexLabels.document,
            uri: 'file:///lsif-test/sub/path/index.ts',
            languageId: 'typescript',
        })

        c.insert({
            id: '3',
            type: ElementTypes.vertex,
            label: VertexLabels.range,
            start: { line: 3, character: 16 },
            end: { line: 3, character: 19 },
        })

        c.insert({
            id: '4',
            type: ElementTypes.vertex,
            label: VertexLabels.definitionResult,
        })

        c.insert({
            id: '5',
            type: ElementTypes.vertex,
            label: VertexLabels.referenceResult,
        })

        c.insert({
            id: '5',
            type: ElementTypes.edge,
            label: EdgeLabels.item,
            outV: '4',
            inVs: ['3'],
            document: '2',
        })

        c.insert({
            id: '5',
            type: ElementTypes.edge,
            label: EdgeLabels.item,
            outV: '5',
            inVs: ['3'],
            document: '2',
        })

        const defs = c.definitionData.get('4')
        expect(defs && defs.get('2')).toEqual(['3'])

        const refs = c.referenceData.get('5')
        expect(refs && refs.get('2')).toEqual(['3'])
    })

    it('should correlate linked reference results', () => {
        const c = new Correlator()

        c.insert({
            id: '2',
            type: ElementTypes.vertex,
            label: VertexLabels.referenceResult,
        })

        c.insert({
            id: '3',
            type: ElementTypes.vertex,
            label: VertexLabels.referenceResult,
        })

        c.insert({
            id: '4',
            type: ElementTypes.vertex,
            label: VertexLabels.referenceResult,
        })

        c.insert({
            id: '5',
            type: ElementTypes.edge,
            label: EdgeLabels.item,
            outV: '2',
            inVs: ['3', '4'],
            document: '1',
        })

        c.insert({
            id: '6',
            type: ElementTypes.edge,
            label: EdgeLabels.item,
            outV: '4',
            inVs: ['3'],
            document: '1',
        })

        expect(c.linkedReferenceResults.extractSet('2')).toEqual(new Set(['2', '3', '4']))
        expect(c.linkedReferenceResults.extractSet('3')).toEqual(new Set(['2', '3', '4']))
        expect(c.linkedReferenceResults.extractSet('4')).toEqual(new Set(['2', '3', '4']))
    })

    it('should normalize hover results', () => {
        const c = new Correlator()
        c.insert({
            id: '1',
            type: ElementTypes.vertex,
            label: VertexLabels.hoverResult,
            result: {
                contents: {
                    language: 'typescript',
                    value: 'bar',
                },
            },
        })

        expect(c.hoverData.get('1')).toEqual('```typescript\nbar\n```')
    })

    it('should stash imported monikers', () => {
        const c = new Correlator()
        c.insert({
            id: '1',
            type: ElementTypes.vertex,
            label: VertexLabels.moniker,
            kind: MonikerKind.import,
            scheme: 'tsc',
            identifier: 'lsif-test:index:foo',
        })

        c.insert({
            id: '2',
            type: ElementTypes.vertex,
            label: VertexLabels.packageInformation,
            manager: 'npm',
            name: 'dependency',
            version: '0.1.0',
        })

        c.insert({
            id: '3',
            type: ElementTypes.edge,
            label: EdgeLabels.packageInformation,
            outV: '1',
            inV: '2',
        })

        expect(c.importedMonikers).toEqual(new Set(['1']))
    })

    it('should stash exported monikers', () => {
        const c = new Correlator()
        c.insert({
            id: '1',
            type: ElementTypes.vertex,
            label: VertexLabels.moniker,
            kind: MonikerKind.export,
            scheme: 'tsc',
            identifier: 'lsif-test:index:foo',
        })

        c.insert({
            id: '2',
            type: ElementTypes.vertex,
            label: VertexLabels.packageInformation,
            manager: 'npm',
            name: 'dependency',
            version: '0.1.0',
        })

        c.insert({
            id: '3',
            type: ElementTypes.edge,
            label: EdgeLabels.packageInformation,
            outV: '1',
            inV: '2',
        })

        expect(c.exportedMonikers).toEqual(new Set(['1']))
    })

    it('should correlate monikers', () => {
        const c = new Correlator()
        c.insert({
            id: '1',
            type: ElementTypes.vertex,
            label: VertexLabels.range,
            start: { line: 3, character: 16 },
            end: { line: 3, character: 19 },
        })

        c.insert({
            id: '2',
            type: ElementTypes.vertex,
            label: VertexLabels.moniker,
            scheme: 'tsc',
            identifier: 'lsif-test:index:foo',
        })

        c.insert({
            id: '3',
            type: ElementTypes.vertex,
            label: VertexLabels.moniker,
            scheme: 'npm',
            identifier: 'lsif-test:index:foo',
        })

        c.insert({
            id: '4',
            type: ElementTypes.vertex,
            label: VertexLabels.moniker,
            scheme: 'super-npm',
            identifier: 'lsif-test:index:foo',
        })

        c.insert({
            id: '5',
            type: ElementTypes.edge,
            label: EdgeLabels.moniker,
            outV: '1',
            inV: '2',
        })

        c.insert({
            id: '6',
            type: ElementTypes.edge,
            label: EdgeLabels.nextMoniker,
            outV: '2',
            inV: '3',
        })

        c.insert({
            id: '6',
            type: ElementTypes.edge,
            label: EdgeLabels.nextMoniker,
            outV: '3',
            inV: '4',
        })

        const range = c.rangeData.get('1')
        expect(range && range.monikerIds).toEqual(new Set(['2']))
        expect(c.linkedMonikers.extractSet('2')).toEqual(new Set(['2', '3', '4']))
        expect(c.linkedMonikers.extractSet('3')).toEqual(new Set(['2', '3', '4']))
        expect(c.linkedMonikers.extractSet('4')).toEqual(new Set(['2', '3', '4']))
    })
})

describe('normalizeHover', () => {
    it('should handle all lsp.Hover types', () => {
        expect(normalizeHover({ contents: 'foo' })).toEqual('foo')
        expect(normalizeHover({ contents: { language: 'typescript', value: 'bar' } })).toEqual(
            '```typescript\nbar\n```'
        )
        expect(normalizeHover({ contents: { kind: 'markdown', value: 'baz' } })).toEqual('baz')
        expect(
            normalizeHover({
                contents: ['foo', { language: 'typescript', value: 'bar' }],
            })
        ).toEqual('foo\n\n---\n\n```typescript\nbar\n```')
    })
})
