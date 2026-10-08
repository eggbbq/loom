import os

excel_dir = os.path.split(__file__)[0]
os.chdir(excel_dir)


# cc_proj = None
# for f in os.listdir(".."):
#     if f.endswith("_cc") and os.path.isdir("../"+f):
#         cc_proj = f
#         break

# if not cc_proj:
#     print("[Error] There is no project endswith _cc.")
#     exit()


output_CodeDir = "../src/game/tables"
output_DataDir = "../assets/resources/tables"

os.makedirs(output_CodeDir, exist_ok=True)
os.makedirs(output_DataDir, exist_ok=True)

cmd = [
    "dotnet tools/luban/Luban.dll",
    "-t client",
    "-c typescript-bin",
    "-d bin",
    "-x bin.fileExt=bin",
    "--conf tools/luban.conf",
    "-x outputCodeDir={0}".format(output_CodeDir),
    "-x outputDataDir={0}".format(output_DataDir)
]

os.system(" ".join(cmd))

with open("bytebuf.ts.txt", "r") as f:
    luban_bytebuf = f.read()
with open(output_CodeDir + "/bytebuf.ts", "w") as f:
    f.write(luban_bytebuf)
