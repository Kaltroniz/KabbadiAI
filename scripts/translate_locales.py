"""Draft UI translations of en.json with Amazon Translate -> locales/<code>.draft.json
Safety text (h_*, g_*) is never machine-translated: write it with a native speaker.
Usage: python scripts/translate_locales.py pa bn ta te mr"""
import json, pathlib, sys
import boto3

ROOT = pathlib.Path(__file__).parent.parent / "frontend" / "src" / "locales"
en = json.loads((ROOT / "en.json").read_text(encoding="utf-8"))
tr = boto3.client("translate", region_name="us-east-1")
for code in sys.argv[1:]:
    out = {k: tr.translate_text(Text=v, SourceLanguageCode="en", TargetLanguageCode=code)["TranslatedText"]
           for k, v in en.items() if not k.startswith(("h_", "g_"))}
    out["_status"] = "DRAFT machine translation. Native speaker must review. Add h_* and g_* safety text by hand."
    (ROOT / f"{code}.draft.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", code)
