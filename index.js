const moment = require('./moment.js');
const fs = require('fs');
const path = require("path");
const axios = require('axios');
const parser = require('node-html-parser');
const cliProgress = require('cli-progress');
const progress = new cliProgress.SingleBar({}, cliProgress.Presets.legacy);

const PROTOCOL = 'http';
const DOMAIN = 'krasnodon.local';
const ROUTE_OF_FIRST_PAGE = 'index.php/ru/component/content/article/198-investitsii/362-normativno-pravovye-akty.html'; //news
const ROUTE_OF_OTHER_PAGES = ''; //news/page
const JSON_NAME = '362-normativno-pravovye';
const PAGES = 1;
const DATA = [];
const STYLE_NAMES = {
    item: '.item-page > p',
    title: [
        'a > span > span',
        'a'
    ],
    description: '',
    files: [
        {
            file: 'a',
            type: 'href',
            name: 'file',
            dir_before: '362-normativno-pravovye'
        }
    ],
    body: '',
    date: {
        day: '',
        month_and_year: '',
        format: 'DD MMMM YYYY'
    }
};

async function main() {
    try {
        progress.start(PAGES, 0);

        for (let PAGE = 1; PAGE <= PAGES; PAGE++) {
            const request =
                PAGE != 1 && ROUTE_OF_OTHER_PAGES
                    ? await axios.get(`${PROTOCOL}://${DOMAIN}/${ROUTE_OF_OTHER_PAGES}/${PAGE}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'
                        },
                        validateStatus: function (status) {
                            return status >= 200 && status <= 301;
                        },
                        maxRedirects: 0
                    })
                    : await axios.get(`${PROTOCOL}://${DOMAIN}/${ROUTE_OF_FIRST_PAGE}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'
                        },
                        validateStatus: function (status) {
                            return status >= 200 && status <= 301;
                        },
                        maxRedirects: 0
                    });

            const parsed_data = request && request.data ? parser.parse(request.data) : null;
            const elements = parsed_data ? parsed_data.querySelectorAll(STYLE_NAMES.item) : [];

            fillData(elements).then(() => {
                PAGE < PAGES
                    ? progress.increment()
                    : setTimeout(() => {
                        console.log(DATA.length);
                        !fs.existsSync('./json/') ? fs.mkdirSync('./json/', { recursive: true }) : null;
                        fs.writeFileSync(`./json/${JSON_NAME}.json`, JSON.stringify(DATA));
                        progress.stop();
                        process.exit();
                    }, 10000);
            });
        }
    } catch (error) {
        console.error(error);
    }
}

async function fillData(elements) {
    try {

        for (const element of elements) {
            let title_element = null;

            for (let i = 0; i < STYLE_NAMES.title.length; i++) {
                if (title_element) {
                    break;
                } else {
                    title_element = element.querySelector(STYLE_NAMES.title[i]);
                }
            }

            const title = title_element ? title_element.textContent.trim() : '';

            if (title) {
                const length_data = DATA.push({ title });

                const description_element = element.querySelector(STYLE_NAMES.description);
                DATA[length_data - 1].description = description_element ? description_element.textContent.trim() : '';

                for (let i = 0; i < STYLE_NAMES.files.length; i++) {
                    let image_element = element.querySelector(STYLE_NAMES.files[i].file);
                    let src = image_element ? image_element.getAttribute(STYLE_NAMES.files[i].type) : '';
                    src
                        ? downloadFile(src, STYLE_NAMES.files[i].dir_before).then((result) => {
                            DATA[length_data - 1][STYLE_NAMES.files[i].name] = decodeURI(result);
                            DATA[length_data - 1].or_name = path.basename(decodeURI(result));
                        })
                        : null;
                }

                let date_array = [];
                if (STYLE_NAMES.date.day) {
                    const day_element = element.querySelector(STYLE_NAMES.date.day);
                    date_array.push(day_element.textContent.trim());
                }

                if (STYLE_NAMES.date.month_and_year) {
                    const month_and_year_element = element.querySelector(STYLE_NAMES.date.month_and_year);
                    date_array.push(month_and_year_element.lastChild.textContent.trim())
                }

                DATA[length_data - 1].date = date_array.length ? getDate(date_array.join(' '), STYLE_NAMES.date.format) : '';

                const href = title_element ? title_element.getAttribute('href') : '';
                if (href) {
                    const request = await axios.get(`${PROTOCOL}://${DOMAIN}${href}`, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'
                        },
                        validateStatus: function (status) {
                            return status >= 200 && status <= 301;
                        },
                        maxRedirects: 0,
                    });
                    const parsed_data = request && request.data ? parser.parse(request.data) : null;
                    const body_element = parsed_data ? parsed_data.querySelector(STYLE_NAMES.body) : null;
                    DATA[length_data - 1].body = body_element && body_element.innerHTML ? body_element.innerHTML.trim() : '';
                }
            }
        }

    } catch (error) {
        console.error(error);
    }
}

async function downloadFile(src, dir_before) {
    try {
        const request = await axios.get(`${PROTOCOL}://${DOMAIN}${src}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.0.0 Safari/537.36'
            },
            responseType: 'arraybuffer',
        });

        if (request && request.data) {

            const dir = dir_before ? `./uploads/${dir_before}${path.dirname(src)}` : `./uploads${path.dirname(src)}`;
            const name = path.basename(src);
            const full_path = `${dir}/${name}`;

            !fs.existsSync(dir) ? fs.mkdirSync(decodeURI(dir), { recursive: true }) : null;
            fs.writeFileSync(decodeURI(full_path), request.data, { encoding: 'binary' });
            return dir_before ? `/${dir_before}${src}` : src;
        }

        return '';
    } catch (error) {
        console.error(error);
    }
}

function getDate(date, format) {
    return moment(date, format, 'ru').format("YYYY-MM-DD");
}

main();