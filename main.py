import argparse
import sys
import file_processors.csv_handler as csv_handler
import file_processors.json_handler as json_handler
import file_processors.txt_handler as txt_handler

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
        "--file", '-f',
        nargs="?",
        help="File with financial data, supports JSON or TXT format",
    )
    parser.add_argument(
        "--export",
        action="store_true",
        help="Export results to a csv file",
    )
    parser.add_argument(
        "--output", "-o",
        nargs="?",
        help="The output file name, e.g., output.csv",
    )
    args = parser.parse_args()

    if args.file:
        file_type = args.file.spint('.')[-1]
        if file_type == 'json':
            results = json_handler.handler
        elif file_type == 'txt':
            results = txt_handler.handler
        else:
            print(f"\n  ❌ FileType Error: Please input a JSON or TXT file")
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
        print("\n  Use --code to specify the stock codes to analyze, e.g., --code 300750 002594 600519")
        print("  Or use -f to provide a file with financial data (JSON or TXT format), e.g., -f data.json or -f stocks.txt\n")
        sys.exit(1)

    if (args.export or args.output) and results:
        # Check whether the output filename is specified
        if args.output is None:
            # Use the default value if it is not provided
            output = "cas_analyzer.csv"
        else:
            # Check if the filename has a correct .csv extension
            output=args.output
            if output.split('.')[-1] != "csv":
                output += '.csv'

        csv_handler.export_csv(output, results)


if __name__ == "__main__":
    main()
