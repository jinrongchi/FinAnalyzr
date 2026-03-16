import argparse
import sys
from pathlib import Path

import file_processor.csv_handler as csv_handler
from file_processor.file_handler import parse_json, parse_txt

COMMON_FILE_EXTENSIONS = {
    ".json",
    ".txt",
    ".pdf",
    ".docx",
    ".doc",
    ".xlsx",
    ".xls",
    ".html",
    ".htm",
    ".xml",
}


def main():
    parser = argparse.ArgumentParser(
        description="Chinese Stock Report Analyzer, Buy/Sell Advicer",
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
    args = parser.parse_args()

    if args.file:
        file_path = Path(args.file)
        if not file_path.exists():
            print(f"\n  ❌ File Error: The file '{file_path}' does not exist.\n")
            sys.exit(1)
        file_type = file_path.suffix.lower()
        if file_type == ".json":
            results = parse_json(file_path)
        elif file_type == ".txt":
            results = parse_txt(file_path)
        else:
            print(
                f"\n  ❌ FileType Error: Only JSON or TXT format file is supported, but got '{file_type.upper()}'\n"
            )
            sys.exit(1)
    elif args.code:
        fetcher = AkShareFetcher()
        for code in args.code:
            try:
                fd = fetcher.fetch(code)
                res = analyzer.analyze(fd)
                print_report(res)
                results.append(res)
            except Exception as e:
                print(f"\n  ❌ Error processing {code}: {e}")
    else:
        print(
            "\n  Use --code to specify the stock codes to analyze, e.g., --code 300750 002594 600519"
        )
        print(
            "  Or use -f to provide a file with financial data (JSON or TXT format), e.g., -f data.json or -f stocks.txt\n"
        )
        sys.exit(1)

    results = "placeholder"
    if (args.export or args.output) and results:
        # Check whether the output filename is specified
        if args.output is None:
            # Use the default value if it is not provided
            output = Path("cas_analyzer.csv")
        else:
            # Check if the filename has a correct .csv extension
            output = Path(args.output)
            file_extension = output.suffix.lower()
            if not args.output.lower().endswith(".csv"):
                if file_extension in COMMON_FILE_EXTENSIONS:
                    print(
                        f"\n  Warning: The output file must have a .csv extension, but got '{file_extension}'\n"
                    )
                    print(f"  The file will be saved as '{output.stem}.csv'.\n")
                else:
                    print(
                        f"\n  Warning: The output file '{args.output}' does not have a common file extension. The file '{output.stem}.csv' will be generated to save the report.\n"
                    )
                output = output.stem + ".csv"
        print(output)
        # csv_handler.export_csv(output, results)


if __name__ == "__main__":
    main()
