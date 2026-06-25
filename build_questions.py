from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path

import pandas as pd


BASE_DIR = Path(__file__).resolve().parent
SOURCE_XLSX = BASE_DIR / "调车题库(1).xlsx"
OUTPUT_JS = BASE_DIR / "questions.js"


def clean(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and pd.isna(value):
        return ""
    text = str(value).strip()
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return re.sub(r"\s+", " ", text)


def detect_type(raw: str) -> str:
    if "多" in raw:
        return "multi"
    if "判断" in raw:
        return "judge"
    if "填" in raw:
        return "fill"
    return "single"


def parse_letters(text: str) -> list[str]:
    letters = []
    for letter in re.findall(r"[A-D]", text.upper()):
        if letter not in letters:
            letters.append(letter)
    return letters


def parse_blank_answers(answer_text: str) -> list[dict[str, str]]:
    matches = re.findall(r"(空\s*\d+)\s*[：:]\s*([^；;]+)", answer_text)
    if matches:
        return [
            {"label": re.sub(r"\s+", "", label), "value": clean(value)}
            for label, value in matches
            if clean(value)
        ]
    return [{"label": "空1", "value": answer_text}] if answer_text else []


def infer_letters_from_answer(options: list[dict[str, str]], answer_text: str) -> list[str]:
    wanted = clean(answer_text)
    if not wanted:
        return []
    matches = [item["key"] for item in options if clean(item["text"]) == wanted]
    return matches


def build_questions() -> dict:
    if not SOURCE_XLSX.exists():
        raise FileNotFoundError(f"未找到题库文件：{SOURCE_XLSX}")

    df = pd.read_excel(SOURCE_XLSX, sheet_name=0, header=2, dtype=str).fillna("")
    questions: list[dict] = []

    for _, row in df.iterrows():
        serial = clean(row.iloc[0])
        source_no = clean(row.iloc[1]) or serial
        type_name = clean(row.iloc[2])
        question_text = clean(row.iloc[3])
        if not question_text or type_name == "":
            continue

        question_type = detect_type(type_name)
        raw_answer_letters = clean(row.iloc[8])
        answer_text = clean(row.iloc[9])

        if question_type == "judge":
            options = [{"key": "A", "text": "对"}, {"key": "B", "text": "错"}]
            answer_letters = ["A"] if answer_text == "对" else ["B"]
        elif question_type == "fill":
            options = []
            answer_letters = []
        else:
            options = [
                {"key": key, "text": clean(row.iloc[index])}
                for key, index in zip(["A", "B", "C", "D"], [4, 5, 6, 7])
                if clean(row.iloc[index])
            ]
            answer_letters = parse_letters(raw_answer_letters)
            if not answer_letters:
                answer_letters = infer_letters_from_answer(options, answer_text)

        blank_answers = parse_blank_answers(answer_text) if question_type == "fill" else []
        questions.append(
            {
                "id": source_no,
                "serial": serial,
                "type": question_type,
                "typeName": type_name,
                "question": question_text,
                "options": options,
                "answer": answer_letters,
                "answerText": answer_text,
                "blankAnswers": blank_answers,
                "imageFile": clean(row.iloc[10]) if len(row) > 10 else "",
            }
        )

    counts = {key: 0 for key in ["single", "judge", "multi", "fill"]}
    for item in questions:
        counts[item["type"]] += 1

    return {
        "meta": {
            "title": "调车题库",
            "total": len(questions),
            "counts": counts,
            "source": SOURCE_XLSX.name,
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
        },
        "questions": questions,
    }


def main() -> None:
    payload = build_questions()
    js = "window.SHUNTING_BANK = "
    js += json.dumps(payload, ensure_ascii=False, indent=2)
    js += ";\n"
    OUTPUT_JS.write_text(js, encoding="utf-8")

    counts = payload["meta"]["counts"]
    print(f"已生成 {OUTPUT_JS}")
    print(f"总题量：{payload['meta']['total']}")
    print(
        "题型："
        f"单选 {counts['single']}，"
        f"判断 {counts['judge']}，"
        f"多选 {counts['multi']}，"
        f"填空 {counts['fill']}"
    )


if __name__ == "__main__":
    main()
