import argparse
import sys
from pathlib import Path

import file_processor.csv_handler as csv_handler
from fetcher.akshare_fetcher import AkShareFetcher
from file_processor.file_handler import parse_json, parse_txt


def _parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Chinese Stock Report Analyzer, Buy/Sell Adviser",
        formatter_class=argparse.RawTextHelpFormatter,
    )
    parser.add_argument(
        "--code",
        nargs="+",
        help="One or more stock codes, e.g. --code 300750 002594 600519",
    )
    parser.add_argument(
        "--file",
        "-f",
        nargs="?",
        help="File with financial data, supports JSON or TXT format",
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Export results to a csv file",
    )
    parser.add_argument(
        "--output",
        "-o",
        nargs="?",
        help="The output file name, e.g., cas_report.csv",
    )
    return parser.parse_args()


def _process_file(file_path: Path) -> list:
    if not file_path.exists():
        print(f"\n  ❌ File Error: The file '{file_path}' does not exist.\n")
        sys.exit(1)
    file_type = file_path.suffix.lower()
    if file_type == ".json":
        return parse_json(file_path)
    elif file_type == ".txt":
        return parse_txt(file_path)
    else:
        print(
            f"\n  ❌ FileType Error: Only JSON or TXT format file is supported, but got '{file_type.upper()}'\n"
        )
        sys.exit(1)


def _process_codes(codes: list) -> list:
    results = []

    fetcher = AkShareFetcher()
    for code in codes:
        try:
            fd = fetcher.fetch(code)
            # res = analyzer.analyze(fd)
            # print_report(res)
            results.append(fd)
        except Exception as e:
            print(f"\n  ❌ Error processing {code}: {e}")
    return results


def _handle_export(args, results):
    if not results:
        return
    if args.output is None:
        output = "cas_analyzer.csv"
    else:
        output = args.output
        if not output.lower().endswith(".csv"):
            stem = Path(output).stem
            print(
                f"\n  ⚠️  Warning: The output file must have a .csv extension. Saving as '{stem}.csv'.\n"
            )
            output = f"{stem}.csv"
    print(f"Exporting to {output}")
    # csv_handler.export_csv(output, results)


def main():
    args = _parse_arguments()
    results = []

    if args.file:
        file_path = Path(args.file)
        results = _process_file(file_path)
    elif args.code:
        results = _process_codes(args.code)
    else:
        print(
            "\n  ArgsError\n  Use --code to specify the stock codes to analyze, e.g., --code SH601127 SZ002850 SH600031"
        )
        print(
            "  Or use -f to provide a file with financial data (JSON or TXT format), e.g., -f data.json or -f stocks.txt\n"
        )
        sys.exit(1)
    print(results)
    if args.export or args.output:
        _handle_export(args, results)


if __name__ == "__main__":
    main()
