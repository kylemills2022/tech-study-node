import md5 from 'blueimp-md5';
import chalk from 'chalk';
import pup from 'puppeteer-core';
import STUDY_CONFIG from '../config/study';
import URL_CONFIG from '../config/url';
import shared from '../shared';
import {
  examPaper,
  examWeekly,
  getAnswer1,
  getAnswer2,
  getAnswer3,
  postAnswer,
} from '../apis';
import {
  createRandomPath,
  createRandomPoint,
  getBatchText,
  getBounds,
  getCookieIncludesDomain,
  getCount,
  getText,
  sleep,
  stringfyCookie,
  stringfyData,
} from '../utils';
import { getTaskList } from './user';

/**
 * @description 练习测试
 * @param type
 */
const handleExam = async (type: number): Promise<boolean> => {
  // 每日答题
  if (type === 0) {
    // 跳转每周答题
    const gotoRes = await shared.gotoPage(URL_CONFIG.examPractice, {
      waitUntil: 'domcontentloaded',
    });
    // 页面
    const page = shared.getPage();
    // 跳转成功
    if (gotoRes && page) {
      // 开始答题
      await handleQuestion(page, 0);
      // 任务列表
      const taskList = await getTaskList();
      // 继续做
      if (taskList && !taskList[2].status) {
        // 重新答题
        return await handleExam(0);
      }
      return true;
    }
    return false;
  }
  // 每周答题
  if (type === 1) {
    // 查找题号
    const examWeekly = await findExamWeekly();
    // 存在习题
    if (examWeekly) {
      // id
      const { id, name } = examWeekly;
      // 每周答题链接
      const url = `${URL_CONFIG.examWeekly}?id=${id}`;
      // 跳转每周答题
      const gotoRes = await shared.gotoPage(url, {
        waitUntil: 'domcontentloaded',
      });
      // 页面
      const page = shared.getPage();
      // 跳转成功
      if (gotoRes && page) {
        // 答题结果
        const result = await handleQuestion(page, 1);
        // 答题失败
        if (!result) {
          // 推送学习提示
          shared.pushModal({
            title: '学习提示',
            content: [
              '每周答题, 答题失败!',
              `标题: <span style="color: #1890ff">${name}</span>`,
              `链接: <span style="color: #1890ff">${url}</span>`,
            ],
            type: 'warn',
          });
        }
        return result;
      }
    } else {
      return true;
    }
  }
  // 专项练习
  if (type === 2) {
    // 查找题号
    const examPaper = await findExamPaper();
    // 存在习题
    if (examPaper) {
      // id
      const { id, name } = examPaper;
      // 专项练习链接
      const url = `${URL_CONFIG.examPaper}?id=${id}`;
      // 跳转专项练习
      const gotoRes = await shared.gotoPage(url, {
        waitUntil: 'domcontentloaded',
      });
      // 页面
      const page = shared.getPage();
      // 请求成功
      if (gotoRes && page) {
        // 答题结果
        const result = await handleQuestion(page, 2);
        // 答题失败
        if (!result) {
          // 推送学习提示
          shared.pushModal({
            title: '学习提示',
            content: [
              '专项练习, 答题失败!',
              `标题: <span style="color: #1890ff">${name}</span>`,
              `链接: <span style="color: #1890ff">${url}</span>`,
            ],
            type: 'warn',
          });
        }
        return result;
      }
    } else {
      return true;
    }
  }
  return false;
};

/**
 * @description 初始化答题
 * @returns
 */
const initExam = async (type: number = 0) => {
  // 每周答题
  if (type === 0) {
    // 请求第一页
    const res = await getExamWeekly(1);
    if (res) {
      // 总页数
      const { totalPageCount } = res;
      // 请求速率限制
      await sleep(STUDY_CONFIG.rateLimitms);
      return totalPageCount;
    }
    return;
  }
  // 专项练习
  if (type === 1) {
    // 请求第一页
    const res = await getExamPaper(1);
    if (res) {
      // 总页数
      const { totalPageCount } = res;
      // 请求速率限制
      await sleep(STUDY_CONFIG.rateLimitms);
      return totalPageCount;
    }
  }
};

/**
 * @description 获取每周答题
 * @returns
 */
const findExamWeekly = async () => {
  // 总页数
  const total = await initExam(1);
  // 当前页数
  let current = STUDY_CONFIG.weeklyReverse ? total : 1;
  if (total && current) {
    while (current <= total && current) {
      // 当前页数数据
      const res = await getExamWeekly(current);
      if (res) {
        const { list } = res;
        for (const i in list) {
          // 获取每周列表
          const examWeeks = list[i].practices;
          // 逆序每周列表
          if (STUDY_CONFIG.weeklyReverse) {
            examWeeks.reverse();
          }
          // 查询每周的测试列表
          for (const j in examWeeks) {
            // 遍历查询有没有没做过的 1为"开始答题" , 2为"重新答题"
            if (examWeeks[j].status !== 2) {
              return examWeeks[j];
            }
          }
        }
        current += STUDY_CONFIG.weeklyReverse ? -1 : 1;
        // 请求速率限制
        await sleep(STUDY_CONFIG.rateLimitms);
      } else {
        break;
      }
    }
    return;
  }
};

/**
 * @description 获取每周答题
 * @returns
 */
const findExamPaper = async () => {
  // 总页数
  const total = await initExam(1);
  // 当前页数
  let current = STUDY_CONFIG.paperReverse ? total : 1;
  if (total && current) {
    while (current <= total && current) {
      // 当前页数数据
      const res = await getExamPaper(current);
      if (res) {
        // 专项练习列表
        const examPapers = res.list;
        // 逆序专项练习列表
        if (STUDY_CONFIG.paperReverse) {
          examPapers.reverse();
        }
        // 遍历专项练习列表
        for (const i in examPapers) {
          // 1为"开始答题" , 2为"重新答题"
          if (examPapers[i].status !== 2) {
            return examPapers[i];
          }
        }
        current += STUDY_CONFIG.paperReverse ? -1 : 1;
        // 请求速率限制
        await sleep(STUDY_CONFIG.rateLimitms);
      } else {
        break;
      }
    }
  }
};

/**
 * @description 处理练习
 * @param page
 * @param type
 * @returns
 */
const handleQuestion = async (page: pup.Page, type: number) => {
  // 总答题结果
  let result = true;
  // 等待题目
  await sleep(3000);
  // 等待题目加载完成
  const res = await page.evaluate((time) => {
    return new Promise<boolean>((resolve) => {
      // 定时器
      const timer = setInterval(() => {
        // 题目
        const question = document.querySelector('.question');
        // 视频可播放
        if (question) {
          // 清除计时器
          clearInterval(timer);
          // 清除倒计时
          clearInterval(timeout);
          resolve(true);
        }
      }, 100);
      // 超时
      const timeout = setTimeout(() => {
        clearInterval(timer);
        resolve(false);
      }, time);
    });
  }, STUDY_CONFIG.timeout);
  // 题目加载失败
  if (!res) {
    result = false;
    return result;
  }
  // 获取题号
  let { total, current } = await getQuestionNum(page);
  // 进度
  shared.log.info('开始答题!');
  // 开始答题
  for (let i = 0; i < total; i++) {
    // 获取按钮
    let btnText = await getNextBtnText(page);
    // 结束按钮文字
    const finish = ['再练一次', '再来一组', '查看解析'];
    // 结束
    if (finish.includes(btnText)) {
      break;
    }
    // 获取题号
    ({ current } = await getQuestionNum(page));
    // 获取题型
    const questionType = await getQuestionType(page);
    // 显示进度
    shared.log.loading(
      `${chalk.blueBright(current)} / ${total} | 题型: ${chalk.blueBright(
        questionType
      )}`
    );

    // 默认值
    let res = false;
    // 单选题
    if (questionType === '单选题') {
      res = await handleSingleChoice(page);
    }
    // 多选题
    if (questionType === '多选题') {
      res = await handleMutiplyChoice(page);
    }
    // 填空题
    if (questionType === '填空题') {
      res = await handleFillBlanks(page);
    }
    // 答题成功
    if (res) {
      // 显示进度
      shared.log.loading(
        `${chalk.blueBright(current)} / ${total} | 题型: ${chalk.blueBright(
          questionType
        )} 答题成功!`
      );
    } else {
      // 显示进度
      shared.log.loading(
        `${chalk.blueBright(current)} / ${total} | 题型: ${chalk.blueBright(
          questionType
        )} 答题失败, 无答案!`
      );
      // 可能答错且无答案
      result = false;
      if (type === 1 && STUDY_CONFIG.weeklyExitAfterWrong) {
        return result;
      }
      if (type === 2 && STUDY_CONFIG.paperExitAfterWrong) {
        return result;
      }
      // 随机答题
      await handleRandAnswers(page, questionType);
    }
    // 等待跳转
    await sleep(3000);
    // 获取按钮
    btnText = await getNextBtnText(page);
    // 提交答案
    if (btnText === '确定') {
      // 点击
      await clickNextBtn(page);
      // 等待跳转
      await sleep(3000);
      // 获取按钮
      btnText = await getNextBtnText(page);
      // 是否答错
      if (btnText === '下一题' || btnText === '完成') {
        // 是否答错
        const wrong = await isWrong(page);
        // 答错
        if (wrong) {
          // 显示进度
          shared.log.loading(
            `${chalk.blueBright(current)} / ${total} | 题型: ${chalk.blueBright(
              questionType
            )} 答题成功, 答案错误!`
          );
          // 上传答案
          await saveAnswerFromWrong(page);
          // 可能答错
          result = false;
          if (type === 1 && STUDY_CONFIG.weeklyExitAfterWrong) {
            return result;
          }
          if (type === 2 && STUDY_CONFIG.paperExitAfterWrong) {
            return result;
          }
        }
      }
    }
    // 等待
    await sleep(3000);
    // 获取按钮
    btnText = await getNextBtnText(page);
    // 跳转下一题
    if (btnText === '下一题' || btnText === '完成' || btnText === '交卷') {
      // 点击
      await clickNextBtn(page);
    }
    // 等待跳转
    await sleep(3000);
    // 等待滑动验证
    await handleSildeVerify(page);
  }
  shared.log.success(`${chalk.blueBright(current)} / ${total} 答题完成!`);
  // 等待结果提交
  await waitResult(page);
  // 等待提交
  await sleep(3000);
  return result;
};

/**
 * @description 是否答错
 * @param page
 * @returns
 */
const isWrong = async (page: pup.Page) => {
  // 答案内容
  return await page.evaluate(() => {
    // 答案
    const answerBox = document.querySelector('.answer');
    return !!(answerBox && (<HTMLDivElement>answerBox).innerText.length);
  });
};

/**
 * @description 获取下个按钮
 * @param page
 * @returns
 */
const getNextBtnText = async (page: pup.Page) => {
  return await page.$$eval('.ant-btn', (btns) => {
    return new Promise<string>((resolve) => {
      // 定时器
      const timer = setInterval(() => {
        // 下一步按钮
        const nextAll = (<HTMLButtonElement[]>btns).filter(
          (next) => next.innerText.length
        );
        // 数量不唯一
        if (nextAll.length) {
          clearInterval(timer); // 停止定时器
          if (nextAll.length === 2) {
            resolve(nextAll[1].innerText.replaceAll(' ', ''));
            return;
          }
          resolve(nextAll[0].innerText.replaceAll(' ', ''));
        }
      }, 500);
    });
  });
};

/**
 * @description 点击下个按钮
 * @param page
 * @returns
 */
const clickNextBtn = async (page: pup.Page) => {
  return await page.$$eval('.ant-btn', (btns) => {
    // 下一步按钮
    const nextAll = (<HTMLButtonElement[]>btns).filter(
      (next) => next.innerText.length
    );
    // 数量不唯一
    if (nextAll.length) {
      if (nextAll.length === 2) {
        nextAll[1].click();
        return true;
      }
      nextAll[0].click();
      return true;
    }
    return false;
  });
};
/**
 * @description 获取题号信息
 * @param page
 * @returns
 */
const getQuestionNum = async (page: pup.Page) => {
  // 当前题号 总题数
  const [current, total] = await page.$eval('.pager', (node) =>
    (<HTMLElement>node).innerText.split('/').map((txt) => Number(txt))
  );
  return {
    total,
    current,
  };
};

/**
 * @description 获取题型
 * @param page
 * @returns
 */
const getQuestionType = async (page: pup.Page) => {
  // 题型文本
  const questionTypeText = await getText(page, '.q-header');
  // 题型
  const questionType = questionTypeText.trim().substring(0, 3);
  return <'填空题' | '单选题' | '多选题'>questionType;
};

/**
 * @description 选择按钮
 * @param page
 * @param answers
 * @returns
 */
const handleChoiceBtn = async (page: pup.Page, answers: string[]) => {
  return await page.$$eval(
    '.q-answer',
    (nodes, answers) => {
      // 所有选项
      const choices = <HTMLButtonElement[]>nodes;
      // 答案存在
      if (nodes.length && answers.length) {
        // 答案是否对应选项
        return answers.every((answer) => {
          // 最小长度按钮
          let minLengthChoice: HTMLButtonElement | undefined;
          // 遍历
          choices.forEach((choice) => {
            // 选项文本
            const choiceText = choice.innerText.trim();
            // 无符号选项文本
            const unsignedChoiceText = choiceText.replaceAll(/[、，,。 ]/g, '');
            // 无符号答案
            const unsignedAnswer = answer.replaceAll(/[、，,。 ]/g, '');
            // 存在答案文本
            if (
              choiceText === answer ||
              choiceText.includes(answer) ||
              answer.includes(choiceText) ||
              unsignedChoiceText.includes(unsignedAnswer)
            ) {
              // 最小长度选项有值
              if (minLengthChoice) {
                // 最短长度选项与当前选项比较长度
                if (minLengthChoice.innerText.length > choiceText.length) {
                  minLengthChoice = choice;
                }
              } else {
                // 最小长度选项赋值
                minLengthChoice = choice;
              }
            }
          });
          // 存在选项
          if (minLengthChoice) {
            // 选择
            if (!minLengthChoice.classList.contains('chosen')) {
              minLengthChoice.click();
            }
            return true;
          }
          return false;
        });
      }
      return false;
    },
    answers
  );
};

/**
 * @description 填空题
 * @param page
 * @param answers
 * @returns
 */
const handleBlankInput = async (page: pup.Page, answers: string[]) => {
  return await page.$$eval(
    '.blank',
    (nodes, answers) => {
      // 所有填空
      const blanks = <HTMLInputElement[]>nodes;
      // 答案存在
      if (blanks.length && answers.length) {
        // 填空数量和答案数量一致
        if (answers.length === blanks.length) {
          return answers.every((answer, i) => {
            // 答案存在
            if (answer && answer.length) {
              // 输入事件
              const inputEvent = new Event('input', {
                bubbles: true,
              });
              // 设置答案
              blanks[i].setAttribute('value', answer);
              // 触发输入input
              blanks[i].dispatchEvent(inputEvent);
              return true;
            }
            return false;
          });
        }
        // 填空数量为1和提示数量大于1
        if (blanks.length === 1 && answers.length > 1) {
          // 直接将所有答案整合填进去
          const answer = answers.join('');
          // 答案存在
          if (answer && answer.length) {
            // 输入事件
            const inputEvent = new Event('input', {
              bubbles: true,
            });
            // 设置答案
            blanks[0].setAttribute('value', answer);
            // 触发输入input
            blanks[0].dispatchEvent(inputEvent);
            return true;
          }
        }
      }
      return false;
    },
    answers
  );
};

/**
 * @description 单选题
 * @param page
 * @returns
 */
const handleSingleChoice = async (page: pup.Page) => {
  // 获取答案
  const answers = await getAnswerByTips(page);
  // 存在答案
  if (answers.length) {
    // 单答案单选项
    if (answers.length === 1) {
      // 尝试查找点击
      const res = await handleChoiceBtn(page, answers);
      if (res) {
        return true;
      }
      // 判断题
      // 选项
      const choicesText = await getBatchText(page, '.q-answer');
      // 关键词
      const keys = ['正确', '错误'];
      // 判断题
      const exists = choicesText
        .map((choice) => choice.replace(/[A-Z]\./, '').trim())
        .some((choice) => keys.includes(choice));
      // 题目内容
      const content = await getText(page, '.q-body');
      // 题目包含答案
      if (content.includes(answers[0]) && choicesText.length === 2 && exists) {
        //答案
        const answersLike = ['对', '正确'];
        // 尝试查找点击
        for (const i in answersLike) {
          // 尝试查找点击
          const res = await handleChoiceBtn(page, [answersLike[i]]);
          if (res) {
            return true;
          }
        }
      }
    } else {
      // 多答案单选项
      // 可能分隔符
      const seperator = ['', ' ', '，', ';', ',', '、', '-', '|', '+', '/'];
      // 可能答案
      const answersLike = seperator.map((s) => answers.join(s));
      // 答案存在
      if (answersLike.every((answer) => answer.length)) {
        // 可能答案是否正确
        for (const i in answersLike) {
          // 尝试查找点击
          const res = await handleChoiceBtn(page, [answersLike[i]]);
          if (res) {
            return true;
          }
        }
      }
      // 答案存在
      if (answers.every((answer) => answer.length)) {
        // 可能答案是否正确
        for (const i in answers) {
          // 尝试查找点击
          const res = await handleChoiceBtn(page, [answers[i]]);
          if (res) {
            return true;
          }
        }
      }
    }
  }
  // 提示答案不存在 | 提示答案不对应选项
  const answersNetwork = await getAnswerByNetwork(page);
  // 存在答案
  if (answersNetwork.length) {
    // 单答案单选项
    if (answersNetwork.length === 1) {
      // 尝试查找点击
      const res = await handleChoiceBtn(page, answersNetwork);
      if (res) {
        return true;
      }
    } else {
      // 多答案单选项 选项意外拆分
      // 可能分隔符
      const seperator = ['', ' ', ';'];
      // 可能答案
      const answersLike = seperator.map((s) => answers.join(s));
      // 答案存在
      if (answersLike.every((answer) => answer.length)) {
        // 可能答案是否正确
        for (const i in answersLike) {
          // 尝试查找点击
          const res = await handleChoiceBtn(page, [answersLike[i]]);
          if (res) {
            return true;
          }
        }
      }
    }
  }
  return false;
};

/**
 * @description 多选题
 * @param page
 * @returns
 */
const handleMutiplyChoice = async (page: pup.Page) => {
  // 获取答案
  const answers = await getAnswerByTips(page);
  // 选项数
  const choiceBtnCount = await getCount(page, '.q-answer');
  // 存在答案
  if (answers.length) {
    // 题目内容
    const content = await getText(page, '.q-body');
    // 选项文本
    const choicesText = await getBatchText(page, '.q-answer');
    // 选项内容
    const choicesContent = choicesText
      .map((choiceText) => choiceText.split(/[A-Z]./)[1].trim())
      .join('');
    // 填空
    const blanks = content.match(/（）/g) || [];
    // 填空数量、选项数量、答案数量相同 | 选项全文等于答案全文
    if (
      (choiceBtnCount === answers.length && blanks.length === answers.length) ||
      answers.join('') === choicesContent ||
      choiceBtnCount === 2
    ) {
      // 全选
      await page.$$eval('.q-answer', (nodes) => {
        (<HTMLButtonElement[]>nodes).forEach((btn) => {
          if (!btn.classList.contains('chosen')) {
            btn.click();
          }
        });
      });
      return true;
    }
    // 选项数量大于等于答案数量
    if (choiceBtnCount >= answers.length) {
      // 尝试查找点击
      const res = await handleChoiceBtn(page, answers);
      if (res) {
        return true;
      }
    }
  }
  // 提示答案不存在 | 提示答案不对应选项 | 填空数量小于选项数量
  const answersNetwork = await getAnswerByNetwork(page);
  // 存在答案
  if (answersNetwork.length) {
    // 尝试查找点击
    const res = await handleChoiceBtn(page, answers);
    if (res) {
      return true;
    }
  }
  return false;
};

/**
 * @description 填空题
 * @param page
 * @returns
 */
const handleFillBlanks = async (page: pup.Page) => {
  // 获取答案
  const answers = await getAnswerByTips(page);
  // 答案存在
  if (answers.length) {
    // 尝试填空
    const res = await handleBlankInput(page, answers);
    if (res) {
      return true;
    }
  }
  // 提示答案不存在 | 提示答案不对应选项
  const answersNetwork = await getAnswerByNetwork(page);
  // 答案存在
  if (answersNetwork.length) {
    // 尝试填空
    const res = await handleBlankInput(page, answersNetwork);
    if (res) {
      return true;
    }
  }
  return false;
};

/**
 * @description 通过提示获取答案
 * @param page
 * @returns
 */
const getAnswerByTips = async (page: pup.Page) => {
  // 点击提示
  await page.$eval('.tips', (node) => {
    (<HTMLButtonElement>node).click();
  });
  // 获取答案
  return await (
    await getBatchText(page, '.line-feed font[color=red]')
  ).map((ans) => ans.trim());
};

/**
 * @description 通过网络获取答案
 * @param page
 * @returns
 */
const getAnswerByNetwork = async (page: pup.Page) => {
  // 题目内容
  const content = await getText(page, '.q-body');
  // md5加密
  const key = await getKey(page);
  // 获取答案
  const answers1 = await getAnswerSearch1(key);
  if (answers1.length) {
    return answers1;
  }
  // 答案
  const questionClip = content.substring(0, 10);
  // 获取答案
  const answers2 = await getAnswerSearch2(questionClip);
  if (answers2.length) {
    return answers2;
  }
  // 获取答案
  const answers3 = await getAnswerSearch3(questionClip);
  if (answers3.length) {
    return answers3;
  }
  return [];
};

/**
 * @description 获取密钥
 * @param page
 * @returns
 */
const getKey = async (page: pup.Page) => {
  // 题目内容
  const content = await getText(page, '.q-body');
  // md5加密
  const key = md5(content);
  return key;
};

/**
 * @description 通过错题上传答案
 * @param page
 * @returns
 */
const saveAnswerFromWrong = async (page: pup.Page) => {
  // 答案内容
  const answerText = await getText(page, '.answer');
  // 从字符串中拿出答案
  const [, rawaAnswer] = answerText.split('：');
  // 替换
  const answer = rawaAnswer.replaceAll(' ', ';');
  // 答案存在
  if (answer && answer.length) {
    const key = await getKey(page);
    if (key) {
      // 上传答案
      saveAnswer(key, answer);
      return true;
    }
  }
  return false;
};

/**
 * @description 处理滑块验证
 * @param page
 */
const handleSildeVerify = async (page: pup.Page) => {
  // 是否滑块
  const exists = await page.$eval('#nc_mask', (node) => {
    const mask = <HTMLElement>node;
    return mask && getComputedStyle(mask).display !== 'none';
  });
  // 存在滑块
  if (exists) {
    // 等待
    await sleep(3000);
    // 等待加载
    await page.waitForSelector('.nc-container', { timeout: 5000 });
    // 等待加载
    await page.waitForSelector('.nc_scale', { timeout: 5000 });
    // 等待加载
    await page.waitForSelector('.btn_slide', { timeout: 5000 });
    // 轨道
    const track = await getBounds(page, '.nc_scale');
    // 滑块
    const slide = await getBounds(page, '.btn_slide');
    // 轨道滑块
    if (slide && track) {
      // 范围内随机起点
      const start = createRandomPoint(slide);
      // 终点
      const end = {
        x: track.x + track.width,
        y: track.y + track.height / 2,
      };
      // 路径
      const path = createRandomPath(start, end, 5);
      // 滑动到起点
      await page.mouse.move(start.x, start.y, { steps: 1 });
      // tap
      await page.touchscreen.tap(start.x, start.y);
      // 按下按钮
      await page.mouse.down();
      // 滑动
      for (const i in path) {
        await page.mouse.move(path[i].x, path[i].y, { steps: 1 });
      }
      // tap
      await page.touchscreen.tap(
        path[path.length - 1].x,
        path[path.length - 1].y
      );
      // 按键抬起
      await page.mouse.up();
    }
  }
};

/**
 * @description 等待结果提交
 * @param page
 * @returns
 */
const waitResult = async (page: pup.Page) => {
  // 获取按钮
  const btnText = await getNextBtnText(page);
  return new Promise<boolean>((resolve) => {
    // 结束
    const finish = ['再练一次', '再来一组', '查看解析'];
    // 未结束
    if (!finish.includes(btnText)) {
      const timer = setInterval(async () => {
        // 获取按钮
        const btnText = await getNextBtnText(page);
        if (finish.includes(btnText)) {
          clearInterval(timer);
          resolve(true);
        }
      }, 100);
      return;
    }
    resolve(true);
  });
};

/**
 * @description 随机答题
 * @param page
 * @param questionType
 * @returns
 */
const handleRandAnswers = async (page: pup.Page, questionType: string) => {
  // 单选题
  if (questionType === '单选题') {
    // 选项
    const answers = await getBatchText(page, '.q-answer');
    // 随机数
    const randIndex = ~~(Math.random() * answers.length);
    // 随机选择
    return await handleChoiceBtn(page, [answers[randIndex]]);
  }
  // 多选题
  if (questionType === '多选题') {
    // 选项作为答案
    const answers = await getBatchText(page, '.q-answer');
    // 全选
    return await handleChoiceBtn(page, answers);
  }
  // 填空题
  if (questionType === '填空题') {
    // 填空数量
    const blankCount = await getCount(page, '.blank');
    // 答案
    const answers = Array.from<string>({ length: blankCount });
    // 随机答案
    for (const i in answers) {
      answers[i] = i;
    }
    // 随机答案
    return await handleBlankInput(page, answers);
  }
};

/**
 * @description 答案数据
 */
export type AnswerData = {
  status: number;
  data: {
    txt_content: string;
  };
  error: string;
};
/**
 * @description 答题
 */
type ExamPractices = {
  id: number;
  questionNum: number;
  alreadyAnswerNum: number;
  tipScore: number;
  name: string;
  status: number;
  startDate: string;
}[];

/**
 * @description 答案数据
 */
type answerData = {
  status: number;
  data: { txt_content: string; txt_name: string };
};

/**
 * @description 每周答题数据
 * @param pageNo
 * @returns
 */
export const getExamWeekly = async (pageNo: number) => {
  // 获取页面
  const page = shared.getPage();
  if (!page) {
    return;
  }
  try {
    // 获取 cookies
    const cookies = await getCookieIncludesDomain(page, '.xuexi.cn');
    // cookie
    const cookie = stringfyCookie(cookies);
    // 每周答题
    const data = await examWeekly(cookie, pageNo);
    // 答题数据
    const paperJson = decodeURIComponent(
      escape(atob(data.data_str.replace(/-/g, '+').replace(/_/g, '/')))
    );
    // JSON格式化
    const paper = <
      {
        list: {
          practices: ExamPractices;
        }[];
        totalPageCount: number;
      }
    >JSON.parse(paperJson);
    return paper;
  } catch (e) {}
};

/**
 * @description 专项练习数据
 * @param pageNo
 * @returns
 */
export const getExamPaper = async (pageNo: number) => {
  // 获取页面
  const page = shared.getPage();
  if (!page) {
    return;
  }
  try {
    // 获取 cookies
    const cookies = await getCookieIncludesDomain(page, '.xuexi.cn');
    // cookie
    const cookie = stringfyCookie(cookies);
    // 获取专项练习
    const data = await examPaper(cookie, pageNo);
    // 答题数据
    const paperJson = decodeURIComponent(
      escape(atob(data.data_str.replace(/-/g, '+').replace(/_/g, '/')))
    );
    // JSON格式化
    const paper = <
      {
        list: ExamPractices;
        totalPageCount: number;
      }
    >JSON.parse(paperJson);
    return paper;
  } catch (e) {}
};

/**
 * @description 保存答案
 * @param key
 * @param value
 * @returns
 */
export const saveAnswer = async (key: string, value: string) => {
  try {
    // 内容
    const content = JSON.stringify([{ title: key, content: value }]);
    // 数据
    const data = {
      txt_name: key,
      txt_content: content,
      password: '',
      v_id: '',
    };
    // 请求体
    const body = stringfyData(data);
    // 保存答案
    const res = await postAnswer(body);
    return res;
  } catch (e) {}
};

/**
 * @description 获取答案
 * @param key
 * @returns
 */
export const getAnswerSearch1 = async (key: string) => {
  try {
    // 数据
    const data = {
      txt_name: key,
      password: '',
    };
    // 保存答案
    const res = await getAnswer1(data);
    if (res) {
      // 结果
      const { status, data } = <answerData>res;
      if (status !== 0) {
        // 答案列表
        const answerList: { content: string; title: string }[] = JSON.parse(
          data.txt_content
        );
        // 答案
        const answers = answerList[0].content.split(';');
        return answers;
      }
    }
  } catch (e) {}
  return [];
};

/**
 * @description 获取答案
 * @param question
 * @returns
 */
export const getAnswerSearch2 = async (question: string) => {
  try {
    // 保存答案
    const res = await getAnswer2(question);
    // 请求成功
    if (res) {
      // 答案
      const answerList =
        (<string>res).match(/(?<=答案：.*[A-Z][.、：])[^<]+/g) ||
        (<string>res).match(/(?<=答案：.*)[^<A-Z]+/g);
      if (answerList && answerList.length) {
        // 答案文本
        const answerText = answerList[0];
        // 答案
        const answers = answerText
          .split(/[,，][A-Z][.、：]/)
          .map((ans) => ans.trim());
        return answers;
      }
    }
  } catch (e) {}
  return [];
};

/**
 * @description 获取答案
 * @param question
 * @returns
 */
export const getAnswerSearch3 = async (question: string) => {
  try {
    // 数据
    const data = {
      keyboard: question,
      show: 'title',
      tempid: 1,
      tbname: 'news',
    };
    // 保存答案
    const res = await getAnswer3(data);
    // 请求成功
    if (res) {
      // 答案和题目
      const answerAndChoice = (<string>res).match(
        /(?<=<p>)(.*)<\/p>\s*<p>答案：<b style="color:#f00">(.*)(?=<\/b><\/p>)/
      );
      // 答案和选项存在
      if (answerAndChoice && answerAndChoice.length) {
        // 选项
        const choicesText = answerAndChoice[1]
          .split(/[A-Z][.、：]/)
          .map((choice) => choice.trim())
          .filter((choice) => choice.length);
        // 答案
        const answerText = answerAndChoice[2].trim();
        // 选择正则
        const choiceRegexp = /[A-Z]/;
        // 选择题
        if (choiceRegexp.test(answerText) && choicesText.length) {
          //  答案选项
          const choiceIndex = answerText.charCodeAt(0) - 65;
          // 答案
          const answers = [choicesText[choiceIndex]];
          return answers;
        }
        // 填空题
        if (answerText.length) {
          // 答案
          const answers = [answerText];
          return answers;
        }
      }
    }
  } catch (e) {}
  return [];
};

export default handleExam;
