import axiosImporter from "axios"
import { JSDOM } from "jsdom"
import { wrapper } from 'axios-cookiejar-support';
import { Cookie, CookieJar } from 'tough-cookie';
import { HttpsProxyAgent } from "https-proxy-agent";
import { HttpsCookieAgent } from "http-cookie-agent/http"
import { getHector } from "./hector"
// @ts-ignore
import { parseUrl } from 'extract-tld';

const jar = new CookieJar();
process.env.debug = "1";
let _debug = Boolean(process.env.debug)
console.log("debug mode:", _debug)
// const httpsAgent = new HttpsProxyAgent("http://127.0.0.1:8080",{
//     keepAlive: true
// })

// const axios = wrapper(axiosImporter.create({
//     jar: jar,
//     withCredentials: true,
// }))
const axios = axiosImporter.create({
    httpsAgent: new HttpsCookieAgent({
        cookies: {
            jar
        },
        keepAlive: true,
        rejectUnauthorized: false,
    }),

})

// axios.defaults.httpsAgent = httpsAgent
axios.interceptors.request.use(config => {
    // console.log(config);
    return config
})
axios.interceptors.response.use(Response => {
    //console.log('header:', Response.request._header);
    return Response
})


axios.defaults.timeout = 10 * 1000
axios.defaults.headers.common["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0"

export class SearchPC {
    homeUrl: string = "https://www.baidu.com"

    //用于存储查询字符串
    queue: string[] = []

    running: boolean = false

    async run(word: string, expect: number,maxRetry=3) {
        let retry = 0
        const brs = new BaiduResults(word)
        const indexResp = await axios.get(this.homeUrl, {
            responseType: "arraybuffer",
        })

        let { window: { document } } = new JSDOM(indexResp.data,{
            resources: "usable"
        })

        while (brs.items.length < expect && retry < maxRetry) {
            //获取下一页链接
            _debug && console.log('title:', document.title)
            if (document.title.includes("百度安全验证")) {
                throw new Error("百度安全验证")
            }
            document = await this.getNextPage(document, word)
            //检测收录信息
            const index_one = document.querySelector(".op_site_domain_right b")
            const index_two = document.querySelector(".site_tip b")
            brs.words = [...brs.words, ...[...document.querySelectorAll("#rs_new td")].map(item=>item.textContent ?? "").filter(item=>item)]

            if (index_one || index_two) {
                const indexedArr = (index_one?.textContent ?? index_two?.textContent ?? "0").match(/\d+/g)
                brs.indexed = Number(indexedArr ? indexedArr.join("") : "0")
                brs.indexedOnFirstPage = document.querySelectorAll(".result").length
            }

            const results = await this.getResults(document)
            _debug && console.log('results:', results)
            brs.items.push(...results)
            retry++
        }
        return brs;
    }

    async getNextPage(document: Document, word: string): Promise<Document> {
        let search: string
        const next = document.querySelector(".n:last-of-type")
        if (next) {
            const searchParams = new URLSearchParams((next as HTMLLinkElement).href)
            searchParams.set("inputT", `${Math.floor(Math.random()*10000)}`)
            searchParams.set("csor", '13')
            searchParams.set("mod", '1')
            searchParams.set("rsv_sug4", `${Math.floor(Math.random()*10000)}`)
            // searchParams.set("isid",'7392CC9D60D78633')
            searchParams.set("wd", word)
            search = new URLSearchParams(searchParams).toString()
        } else {
            const formData: string[][] = []
            // console.log("allcokies:before:", jar.getCookiesSync(this.homeUrl))

            // jar.setCookie(new Cookie({
            //     key: "BA_HECTOR",
            //     value: getHector(),
            //     domain: "baidu.com"
            // }),this.homeUrl)

            // console.log("allcokies:after:", jar.getCookiesSync(this.homeUrl))
            // exit(0)
            document.querySelector("#form")?.querySelectorAll("input")?.forEach(ele => {
                ele = ele as HTMLInputElement
                if (ele.name.trim().length > 0) {
                    formData.push([ele.name, ele.value])
                }
            })
            const searchParams = new URLSearchParams(formData)
            searchParams.set("inputT", `${Math.floor(Math.random()*10000)}`)
            searchParams.set("csor", '13')
            searchParams.set("mod", '1')
            searchParams.set("rsv_sug4", `${Math.floor(Math.random()*10000)}`)
            // searchParams.set("isid",'7392CC9D60D78633')
            searchParams.set("wd", word)
            search = searchParams.toString()
        }



        const _cr1: number = (function o(e: string) {
            if ("string" == typeof e) {
                var t: number, n: number = 0;
                for (t = 0; t < e.length; t++)
                    n += e.charCodeAt(t);
                return n
            }
            return 0
        })(search)
        // console.log('search:', search, '_cr1:', _cr1, 'url:', `${this.homeUrl}/s?${search}&_cr1=${_cr1}`)
        const firstPageResp = await axios.get(`${this.homeUrl}/s?${search}&_cr1=${_cr1}`, {
            responseType: "arraybuffer"
        })

        return new JSDOM(firstPageResp.data).window.document
    }
    async getResults(document: Document): Promise<BaiduResult[]> {
        const brs:BaiduResult[] = []
        document.querySelectorAll(".result").forEach(result => {
            try {
                const title = result.querySelector(".c-title")?.textContent ?? ""
                const des = [...result.querySelectorAll("span")].find(ele => ele.className.startsWith("content-right"))?.textContent ?? ""
                const showName = result.querySelector(".c-color-gray")?.textContent ?? ""
                const siteUrl = result.getAttribute("mu") ?? ""
                const host = new URL(siteUrl).host;
                const domain = parseUrl(siteUrl).domain
                brs.push(new BaiduResult(title, des, siteUrl, showName, host, domain))
            } catch (ex) {

            }
        })

        return brs
    }
}

export class SearchWap extends SearchPC {
    constructor() {
        super()
    }
    homeUrl: string = "https://m.baidu.com"

    //用于存储查询字符串
    queue: string[] = []

    running: boolean = false

    async run(word: string, expect: number,maxRetry=3) {
        let retry = 0
        const brs = new BaiduResults(word)
        const indexResp = await axios.get(this.homeUrl, {
            responseType: "arraybuffer"
        })

        let { window: { document } } = new JSDOM(indexResp.data)

        while (brs.items.length < expect && retry < maxRetry) {
            _debug && console.log('title:', document.title)
            if (document.title.includes("百度安全验证")) {
                throw new Error("百度安全验证")
            }
            brs.words = [...brs.words,...document.querySelectorAll(".cos-no-underline")]?.map(item=>(item as Element).textContent ?? "").filter(item => item)

            document = await this.getNextPage(document, word)
            const results = await this.getResults(document)
            _debug && console.log('results:',results)
            brs.items.push(...results)
            retry++
        }
        
        return brs;
    }

    async getNextPage(document: Document, word: string): Promise<Document> {
        //更新cookie
        await axios.get(`https://m.baidu.com/tc?tcreq4log=1&ssid=0&from=0&bd_page_type=1&uid=0&pu=usm%4012%2Csz%401320_220%2Cta%40iphone___24_128.0&baiduid=1EC312604E5A470058CC231376BD6CD1&ct=158&cst=1&ref=www_iphone&lid=10416584060568258221&w={(i - 1) * 10}_10_%25E7%25BA%25B8%25E6%259D%25BF%25E5%258E%2582%25E5%25AE%25B6&filter=1&clk_extra={{%22adinfo%22:%221_2%22,%22addom%22:%221_2%22}}&r=${Math.floor(new Date().getTime() / 1000)}`)

        let search: string
        const next = document.querySelector(".new-nextpage-only,.new-nextpage")
        if (next) {
            search = new URLSearchParams((next as HTMLLinkElement).href).toString()
        } else {
            const formData: string[][] = []

            document.querySelector("#index-form")?.querySelectorAll("input")?.forEach(ele => {
                ele = ele as HTMLInputElement
                if (ele.name.trim().length > 0) {
                    formData.push([ele.name, ele.value])
                }
            })
            // console.log('formData:', formData)
            const searchParams = new URLSearchParams(formData);
            searchParams.set("word", word)
            search = searchParams.toString()
        }

        const firstPageResp = await axios.get(`${this.homeUrl}/s?${search}`, {
            responseType: "arraybuffer"
        })
        // console.log('firstPageResp as string:', firstPageResp.data.toString());
        // console.log("document:", new JSDOM(firstPageResp.data).window.document)
        return new JSDOM(firstPageResp.data).window.document
    }
    async getResults(document: Document): Promise<BaiduResult[]> {
        const brs:BaiduResult[] = []
        document.querySelectorAll(".c-result").forEach(result => {
            try {
                const title = result.querySelector(".tts-b-hl,.c-title")?.textContent ?? ""
                if(title == "大家还在搜") throw new Error("not one of result")
                const des = result.querySelector("div[role=text],.ec-full-text-container")?.textContent ?? ""
                const showName = result.querySelector(".cosc-source,.cos-text-body")?.textContent ?? ""
                const siteUrl = JSON.parse(result.getAttribute("data-log") ?? "{}")?.mu ?? ""
                const host = new URL(siteUrl).host;
                console.log("siteUrl",siteUrl)
                const domain = parseUrl(siteUrl).domain
                brs.push(new BaiduResult(title, des, siteUrl, showName, host, domain))
            } catch (ex) {
                _debug && console.log('parse error')
                _debug && console.log(ex)
            }
        })

        return brs
    }
}
export class BaiduResult {
    title: string
    des: string
    siteUrl: string
    showName: string
    host: string
    domain: string
    constructor(title: string, des: string, siteUrl: string, showName: string, host: string, domain: string) {
        this.title = title
        this.des = des
        this.siteUrl = siteUrl
        this.showName = showName
        this.host = host
        this.domain = domain
    }
}

export class BaiduResults {
    indexed: number = -1
    indexedOnFirstPage: number = -1
    words: string[] = []
    keyword: string
    items: BaiduResult[] = []
    constructor(word:string) {
        this.keyword = word
    }
    // toJson(){
    //     return {
    //         items: [...this], // 复制数组元素
    //         indexed: this.indexed, // 复制额外属性
    //         indexedOnFirstPage: this.indexedOnFirstPage, // 复制额外属性
    //         words: this.words, // 复制额外属性
    //         keyword: this.keyword, // 复制额外属性
    //     };
    // }
}

// export default { BaiduResult, BaiduResults, SearchPC, SearchWap }





//test

// new SearchPC().run("site:qq.com", 20).then(console.log)

